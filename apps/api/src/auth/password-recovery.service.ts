import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { normalizeEmail } from './auth.types';

export const PASSWORD_RECOVERY_MESSAGE =
  'Si existe una cuenta activa con ese correo, recibirás instrucciones para recuperar el acceso.';

const PASSWORD_RECOVERY_TTL_MS = 30 * 60 * 1000;
const MAX_RECOVERY_TRANSACTION_RETRIES = 3;

interface RecoveryUser {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
}

interface IssuedRecoveryToken {
  tokenHash: string;
  token: string;
}

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async requestPasswordRecovery(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const email = normalizeEmail(forgotPasswordDto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return { message: PASSWORD_RECOVERY_MESSAGE };
    }

    const resetUrl = this.getSafeResetUrl();
    if (!resetUrl) {
      return { message: PASSWORD_RECOVERY_MESSAGE };
    }

    const issued = await this.issueToken(user);
    const link = new URL(resetUrl.toString());
    link.searchParams.set('token', issued.token);

    try {
      await this.mailService.send({
        to: user.email,
        subject: 'Recupera tu acceso',
        text: `Solicitaste recuperar tu acceso. Usa este enlace antes de 30 minutos: ${link.toString()}`,
      });
    } catch {
      await this.prisma.passwordRecoveryToken.deleteMany({
        where: { tokenHash: issued.tokenHash },
      });
    }

    return { message: PASSWORD_RECOVERY_MESSAGE };
  }

  private async issueToken(user: RecoveryUser): Promise<IssuedRecoveryToken> {
    for (
      let attempt = 0;
      attempt < MAX_RECOVERY_TRANSACTION_RETRIES;
      attempt += 1
    ) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = this.hash(token);
      const passwordHashFingerprint = this.hash(user.passwordHash);
      const expiresAt = new Date(Date.now() + PASSWORD_RECOVERY_TTL_MS);

      try {
        await this.prisma.$transaction(
          (transaction) =>
            transaction.passwordRecoveryToken.upsert({
              where: { userId: user.id },
              create: {
                userId: user.id,
                tokenHash,
                passwordHashFingerprint,
                expiresAt,
                consumedAt: null,
              },
              update: {
                tokenHash,
                passwordHashFingerprint,
                expiresAt,
                consumedAt: null,
              },
            }),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return { token, tokenHash };
      } catch (error) {
        if (this.hasPrismaCode(error, 'P2034')) {
          if (attempt + 1 < MAX_RECOVERY_TRANSACTION_RETRIES) continue;
          throw error;
        }
        throw error;
      }
    }

    throw new Error('Password recovery token could not be issued');
  }

  private getSafeResetUrl(): URL | undefined {
    const configured = this.configService
      .get<string>('AUTH_PASSWORD_RESET_URL')
      ?.trim();
    if (!configured) return undefined;

    try {
      const url = new URL(configured);
      const isLocalhost = url.hostname === 'localhost';
      if (
        (url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && isLocalhost)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        return undefined;
      }

      return url;
    } catch {
      return undefined;
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
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
