import { createHash, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
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
        jwtid: randomUUID(),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async verifyAccessToken(accessToken: string): Promise<AuthTokenPayload> {
    let payload: unknown;

    try {
      payload = await this.jwtService.verifyAsync<Record<string, unknown>>(
        accessToken,
        {
          algorithms: ['HS256'],
          secret: this.accessSecret,
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    if (!this.isAccessTokenPayload(payload)) {
      throw new UnauthorizedException('Invalid access token');
    }

    return payload;
  }

  async verifyRefreshToken(refreshToken: string): Promise<AuthTokenPayload> {
    let payload: unknown;

    try {
      payload = await this.jwtService.verifyAsync<Record<string, unknown>>(
        refreshToken,
        {
          algorithms: ['HS256'],
          secret: this.refreshSecret,
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!this.isRefreshTokenPayload(payload)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return payload;
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

  private isAccessTokenPayload(payload: unknown): payload is AuthTokenPayload {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }

    const candidate = payload as Record<string, unknown>;

    return (
      typeof candidate.sub === 'string' &&
      candidate.sub.trim().length > 0 &&
      typeof candidate.sid === 'string' &&
      candidate.sid.trim().length > 0 &&
      candidate.type === 'access'
    );
  }

  private isRefreshTokenPayload(
    payload: unknown,
  ): payload is AuthTokenPayload & { exp: number } {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }

    const candidate = payload as Record<string, unknown>;
    const nowInSeconds = Math.floor(Date.now() / 1000);

    return (
      typeof candidate.sub === 'string' &&
      candidate.sub.trim().length > 0 &&
      typeof candidate.sid === 'string' &&
      candidate.sid.trim().length > 0 &&
      candidate.type === 'refresh' &&
      typeof candidate.exp === 'number' &&
      Number.isFinite(candidate.exp) &&
      candidate.exp > nowInSeconds
    );
  }
}
