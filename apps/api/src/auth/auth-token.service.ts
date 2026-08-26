import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenPair, AuthTokenPayload } from './auth.types';

@Injectable()
export class AuthTokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.accessSecret = configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTtlSeconds = this.getPositiveInteger(
      configService,
      'JWT_ACCESS_TTL_SECONDS',
    );
    this.refreshTtlSeconds = this.getPositiveInteger(
      configService,
      'JWT_REFRESH_TTL_SECONDS',
    );

    this.assertSecretLength('access', this.accessSecret);
    this.assertSecretLength('refresh', this.refreshSecret);

    if (this.accessSecret === this.refreshSecret) {
      throw new Error('JWT access and refresh secrets must be different');
    }
  }

  async signTokenPair(
    userId: string,
    sessionId: string,
  ): Promise<AuthTokenPair> {
    const accessPayload: AuthTokenPayload = {
      sub: userId,
      sid: sessionId,
      type: 'access',
    };
    const refreshPayload: AuthTokenPayload = {
      sub: userId,
      sid: sessionId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        algorithm: 'HS256',
        secret: this.accessSecret,
        expiresIn: this.accessTtlSeconds,
      }),
      this.jwtService.signAsync(refreshPayload, {
        algorithm: 'HS256',
        secret: this.refreshSecret,
        expiresIn: this.refreshTtlSeconds,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  getRefreshTokenExpiresAt(now = new Date()): Date {
    return new Date(now.getTime() + this.refreshTtlSeconds * 1000);
  }

  private getPositiveInteger(
    configService: ConfigService,
    name: string,
  ): number {
    const value = configService.getOrThrow<string>(name);
    const parsedValue = Number(value);

    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }

    return parsedValue;
  }

  private assertSecretLength(type: string, secret: string): void {
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error(`JWT ${type} secret must contain at least 32 bytes`);
    }
  }
}
