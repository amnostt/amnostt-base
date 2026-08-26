import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenService } from './auth-token.service';

describe('AuthTokenService', () => {
  const signAsync = jest.fn();
  const accessSecret = 'a'.repeat(32);
  const refreshSecret = 'b'.repeat(32);
  const config = {
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_ACCESS_TTL_SECONDS: '900',
    JWT_REFRESH_TTL_SECONDS: '604800',
  };

  const jwtService = {
    signAsync,
  } as unknown as JwtService;

  const configService = {
    getOrThrow: jest.fn((key: keyof typeof config) => config[key]),
  } as unknown as ConfigService;

  const service = new AuthTokenService(jwtService, configService);

  beforeEach(() => {
    signAsync.mockReset();
  });

  it('should sign access and refresh tokens with separate secrets', async () => {
    signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await expect(
      service.signTokenPair('user-id', 'session-id'),
    ).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(signAsync).toHaveBeenNthCalledWith(
      1,
      {
        sub: 'user-id',
        sid: 'session-id',
        type: 'access',
      },
      {
        algorithm: 'HS256',
        secret: accessSecret,
        expiresIn: 900,
      },
    );

    expect(signAsync).toHaveBeenNthCalledWith(
      2,
      {
        sub: 'user-id',
        sid: 'session-id',
        type: 'refresh',
      },
      {
        algorithm: 'HS256',
        secret: refreshSecret,
        expiresIn: 604800,
      },
    );
  });

  it('should reject identical access and refresh secrets', () => {
    const identicalSecretConfig = {
      getOrThrow: jest.fn((key: keyof typeof config) => {
        if (key === 'JWT_REFRESH_SECRET') {
          return accessSecret;
        }

        return config[key];
      }),
    } as unknown as ConfigService;

    expect(
      () => new AuthTokenService(jwtService, identicalSecretConfig),
    ).toThrow('JWT access and refresh secrets must be different');
  });

  it('should hash refresh tokens deterministically with SHA-256', () => {
    const firstHash = service.hashRefreshToken('refresh-token');
    const secondHash = service.hashRefreshToken('refresh-token');
    const differentHash = service.hashRefreshToken('other-token');

    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(secondHash).toBe(firstHash);
    expect(differentHash).not.toBe(firstHash);
  });

  it('should calculate the refresh session expiration', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    expect(service.getRefreshTokenExpiresAt(now)).toEqual(
      new Date('2026-01-08T00:00:00.000Z'),
    );
  });
});
