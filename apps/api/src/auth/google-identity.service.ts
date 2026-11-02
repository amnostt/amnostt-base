import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { normalizeEmail } from './auth.types';
import { GoogleLinkDto } from './dto/google-link.dto';
import {
  GoogleTokenVerifier,
  VerifiedGoogleCredential,
} from './google-token-verifier';

const GOOGLE_LINK_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const INVALID_CHALLENGE_MESSAGE = 'Invalid Google link challenge';
const INVALID_CREDENTIAL_MESSAGE = 'Invalid Google credential';

export interface GoogleProviderStatus {
  provider: 'google';
  enabled: boolean;
  clientId: string | null;
  linked: boolean;
}

export interface GoogleLinkChallenge {
  challengeId: string;
  nonce: string;
  expiresAt: Date;
}

@Injectable()
export class GoogleIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tokenVerifier: GoogleTokenVerifier,
  ) {}

  async getStatus(userId: string): Promise<GoogleProviderStatus> {
    const clientId = this.getClientId();
    const identity = await this.prisma.googleIdentity.findUnique({
      where: { userId },
      select: { id: true },
    });

    return {
      provider: 'google',
      enabled: clientId !== null,
      clientId,
      linked: identity !== null,
    };
  }

  async createChallenge(
    userId: string,
    sessionId: string,
  ): Promise<GoogleLinkChallenge> {
    this.requireConfigured();

    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { isActive: true },
      },
      select: {
        id: true,
        user: { select: { googleIdentity: { select: { id: true } } } },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    if (session.user.googleIdentity) {
      throw new ConflictException('Google identity is already linked');
    }

    const nonce = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + GOOGLE_LINK_CHALLENGE_TTL_MS);
    const challenge = await this.prisma.googleLinkChallenge.create({
      data: {
        userId,
        sessionId,
        nonceHash: this.hashNonce(nonce),
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    });

    return {
      challengeId: challenge.id,
      nonce,
      expiresAt: challenge.expiresAt,
    };
  }

  async completeLink(
    userId: string,
    sessionId: string,
    linkDto: GoogleLinkDto,
  ): Promise<{ provider: 'google'; linked: true }> {
    this.requireConfigured();

    const challenge = await this.prisma.googleLinkChallenge.findFirst({
      where: {
        id: linkDto.challengeId,
        userId,
        sessionId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        user: { isActive: true },
        session: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { isActive: true },
        },
      },
      select: { nonceHash: true },
    });

    if (!challenge) {
      throw new UnauthorizedException(INVALID_CHALLENGE_MESSAGE);
    }

    let credential: VerifiedGoogleCredential;
    try {
      credential = await this.tokenVerifier.verify(linkDto.credential);
    } catch {
      throw new UnauthorizedException(INVALID_CREDENTIAL_MESSAGE);
    }

    if (
      !credential.sub.trim() ||
      !credential.email.trim() ||
      !credential.emailVerified ||
      !this.matchesNonce(challenge.nonceHash, credential.nonce)
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIAL_MESSAGE);
    }

    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const now = new Date();
          const currentChallenge =
            await transaction.googleLinkChallenge.findFirst({
              where: {
                id: linkDto.challengeId,
                userId,
                sessionId,
                consumedAt: null,
                expiresAt: { gt: now },
                user: { isActive: true },
                session: {
                  userId,
                  revokedAt: null,
                  expiresAt: { gt: now },
                  user: { isActive: true },
                },
              },
              select: {
                nonceHash: true,
                user: { select: { email: true } },
              },
            });

          if (
            !currentChallenge ||
            !this.matchesNonce(currentChallenge.nonceHash, credential.nonce) ||
            normalizeEmail(currentChallenge.user.email) !==
              normalizeEmail(credential.email)
          ) {
            throw new UnauthorizedException(INVALID_CREDENTIAL_MESSAGE);
          }

          const consumed = await transaction.googleLinkChallenge.updateMany({
            where: {
              id: linkDto.challengeId,
              userId,
              sessionId,
              consumedAt: null,
              expiresAt: { gt: now },
            },
            data: { consumedAt: now },
          });

          if (consumed.count !== 1) {
            throw new UnauthorizedException(INVALID_CHALLENGE_MESSAGE);
          }

          await transaction.googleIdentity.create({
            data: {
              userId,
              googleSub: credential.sub,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      if (this.hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Google identity is already linked');
      }

      if (this.hasPrismaCode(error, 'P2034')) {
        throw new ConflictException('Google link could not be completed');
      }

      throw error;
    }

    return { provider: 'google', linked: true };
  }

  private getClientId(): string | null {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim();
    return clientId || null;
  }

  private requireConfigured(): void {
    if (!this.getClientId()) {
      throw new ServiceUnavailableException('Google linking is not configured');
    }
  }

  private hashNonce(nonce: string): string {
    return createHash('sha256').update(nonce).digest('hex');
  }

  private matchesNonce(expectedHash: string, nonce: string): boolean {
    const expected = Buffer.from(expectedHash, 'hex');
    const actual = Buffer.from(this.hashNonce(nonce), 'hex');

    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private hasPrismaCode(error: unknown, code: string): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === code;
    }

    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
