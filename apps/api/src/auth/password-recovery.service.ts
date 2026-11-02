import { createHash, randomBytes } from 'node:crypto';
import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Prisma } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { normalizeEmail } from './auth.types';

export const PASSWORD_RECOVERY_MESSAGE =
  'Si existe una cuenta activa con ese correo, recibirás instrucciones para recuperar el acceso.';
export const PASSWORD_RESET_ERROR =
  'El enlace de recuperación no es válido o ha expirado.';

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

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const token = resetPasswordDto.token;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new UnauthorizedException(PASSWORD_RESET_ERROR);
    }

    const tokenHash = this.hash(token);
    const passwordHash = await argon2.hash(resetPasswordDto.newPassword, {
      type: argon2.argon2id,
    });

    for (
      let attempt = 0;
      attempt < MAX_RECOVERY_TRANSACTION_RETRIES;
      attempt += 1
    ) {
      try {
        await this.prisma.$transaction(
          async (transaction) => {
            const recovery = await transaction.passwordRecoveryToken.findUnique(
              {
                where: { tokenHash },
                select: {
                  userId: true,
                  passwordHashFingerprint: true,
                  expiresAt: true,
                  consumedAt: true,
                  user: {
                    select: {
                      isActive: true,
                      passwordHash: true,
                    },
                  },
                },
              },
            );
            const now = new Date();

            if (
              !recovery ||
              recovery.consumedAt !== null ||
              recovery.expiresAt <= now ||
              !recovery.user.isActive ||
              recovery.passwordHashFingerprint !==
                this.hash(recovery.user.passwordHash)
            ) {
              throw new UnauthorizedException(PASSWORD_RESET_ERROR);
            }

            const consumedAt = new Date();
            const consumed = await transaction.passwordRecoveryToken.updateMany(
              {
                where: {
                  tokenHash,
                  consumedAt: null,
                  expiresAt: { gt: now },
                },
                data: { consumedAt },
              },
            );

            if (consumed.count !== 1) {
              throw new UnauthorizedException(PASSWORD_RESET_ERROR);
            }

            await transaction.user.update({
              where: { id: recovery.userId },
              data: { passwordHash },
            });
            await transaction.passwordRecoveryToken.updateMany({
              where: {
                userId: recovery.userId,
                consumedAt: null,
              },
              data: { consumedAt },
            });
            await transaction.session.updateMany({
              where: {
                userId: recovery.userId,
                revokedAt: null,
              },
              data: { revokedAt: consumedAt },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }

        if (this.isTransactionConflict(error)) {
          if (attempt + 1 < MAX_RECOVERY_TRANSACTION_RETRIES) continue;
          throw new InternalServerErrorException(
            'Password reset could not be completed',
          );
        }

        throw error;
      }
    }

    throw new InternalServerErrorException(
      'Password reset could not be completed',
    );
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
