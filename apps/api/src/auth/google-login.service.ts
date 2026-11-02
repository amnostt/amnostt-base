import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthService } from './auth.service';
import { LoginResult } from './auth.types';
import { GoogleLinkDto } from './dto/google-link.dto';
import {
  GoogleTokenVerifier,
  VerifiedGoogleCredential,
} from './google-token-verifier';

export const GOOGLE_LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const INVALID_GOOGLE_LOGIN_MESSAGE = 'Invalid Google credentials';

export interface GoogleProviderConfig {
  provider: 'google';
  enabled: boolean;
  clientId: string | null;
}

export interface GoogleLoginChallenge {
  challengeId: string;
  nonce: string;
  expiresAt: Date;
  browserProof: string;
}

@Injectable()
export class GoogleLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tokenVerifier: GoogleTokenVerifier,
    private readonly authService: AuthService,
  ) {}

  getConfig(): GoogleProviderConfig {
    const clientId = this.getClientId();
    return {
      provider: 'google',
      enabled: clientId !== null,
      clientId,
    };
  }

  async createChallenge(): Promise<GoogleLoginChallenge> {
    this.requireConfigured();

    const nonce = randomBytes(32).toString('base64url');
    const browserProof = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + GOOGLE_LOGIN_CHALLENGE_TTL_MS);
    const challenge = await this.prisma.googleLoginChallenge.create({
      data: {
        nonceHash: this.hash(nonce),
        browserProofHash: this.hash(browserProof),
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    });

    return {
      challengeId: challenge.id,
      nonce,
      expiresAt: challenge.expiresAt,
      browserProof,
    };
  }

  async login(
    loginDto: GoogleLinkDto,
    browserProof: string | undefined,
  ): Promise<LoginResult> {
    this.requireConfigured();

    let credential: VerifiedGoogleCredential | undefined;
    try {
      credential = await this.tokenVerifier.verify(loginDto.credential);
    } catch {
      throw this.invalidLogin();
    }

    if (
      !credential ||
      !credential.sub.trim() ||
      !credential.email.trim() ||
      !credential.emailVerified ||
      !browserProof?.trim()
    ) {
      throw this.invalidLogin();
    }

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const now = new Date();
          const [challenge, identity] = await Promise.all([
            transaction.googleLoginChallenge.findUnique({
              where: { id: loginDto.challengeId },
              select: {
                nonceHash: true,
                browserProofHash: true,
                expiresAt: true,
                consumedAt: true,
              },
            }),
            transaction.googleIdentity.findUnique({
              where: { googleSub: credential.sub },
              select: {
                userId: true,
                user: { select: { isActive: true } },
              },
            }),
          ]);

          if (
            !challenge ||
            challenge.consumedAt !== null ||
            challenge.expiresAt <= now ||
            !this.matches(challenge.nonceHash, credential.nonce) ||
            !this.matches(challenge.browserProofHash, browserProof) ||
            !identity?.user.isActive
          ) {
            throw this.invalidLogin();
          }

          const consumed = await transaction.googleLoginChallenge.updateMany({
            where: {
              id: loginDto.challengeId,
              consumedAt: null,
              expiresAt: { gt: now },
            },
            data: { consumedAt: now },
          });

          if (consumed.count !== 1) {
            throw this.invalidLogin();
          }

          return this.authService.createSessionForUser(
            identity.userId,
            transaction,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (this.isTransactionConflict(error)) {
        throw this.invalidLogin();
      }

      throw error;
    }
  }

  private getClientId(): string | null {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim();
    return clientId || null;
  }

  private requireConfigured(): void {
    if (!this.getClientId()) {
      throw new ServiceUnavailableException('Google login is not configured');
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private matches(expectedHash: string, value: string): boolean {
    const expected = Buffer.from(expectedHash, 'hex');
    const actual = Buffer.from(this.hash(value), 'hex');
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private invalidLogin(): UnauthorizedException {
    return new UnauthorizedException(INVALID_GOOGLE_LOGIN_MESSAGE);
  }

  private isTransactionConflict(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === 'P2034';
    }

    if (typeof error !== 'object' || error === null) {
      return false;
    }

    return (
      error.constructor?.name === 'DriverAdapterError' &&
      'message' in error &&
      (error as { message?: unknown }).message === 'TransactionWriteConflict'
    );
  }
}
