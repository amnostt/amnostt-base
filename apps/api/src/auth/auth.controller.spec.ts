import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const login = jest.fn();
  const cookie = jest.fn();

  const authService = {
    login,
  } as unknown as AuthService;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'NODE_ENV') {
        return 'development';
      }

      return undefined;
    }),
    getOrThrow: jest.fn((key: string) => {
      const config: Record<string, string> = {
        AUTH_COOKIE_SECURE: 'false',
        JWT_REFRESH_TTL_SECONDS: '604800',
      };

      return config[key];
    }),
  } as unknown as ConfigService;

  const response = {
    cookie,
  } as unknown as Response;

  const controller = new AuthController(authService, configService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should set the refresh cookie and return accessToken with currentUser', async () => {
    login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      currentUser: {
        id: 'user-id',
        email: 'member@example.com',
        name: 'Member User',
        role: 'Member',
        permissions: ['tasks:read:own'],
      },
    });

    await expect(
      controller.login(
        {
          email: 'member@example.com',
          password: 'correct-password',
        },
        response,
      ),
    ).resolves.toEqual({
      accessToken: 'access-token',
      currentUser: {
        id: 'user-id',
        email: 'member@example.com',
        name: 'Member User',
        role: 'Member',
        permissions: ['tasks:read:own'],
      },
    });

    expect(cookie).toHaveBeenCalledWith('refresh_token', 'refresh-token', {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 604800000,
    });
  });

  it('should reject insecure cookies in production during construction', () => {
    const productionConfigService = {
      get: jest.fn(() => 'production'),
      getOrThrow: jest.fn((key: string) => {
        const config: Record<string, string> = {
          AUTH_COOKIE_SECURE: 'false',
          JWT_REFRESH_TTL_SECONDS: '604800',
        };

        return config[key];
      }),
    } as unknown as ConfigService;

    expect(
      () => new AuthController(authService, productionConfigService),
    ).toThrow('AUTH_COOKIE_SECURE must be true in production');
  });

  it('should set a secure refresh cookie in production', async () => {
    const productionConfigService = {
      get: jest.fn(() => 'production'),
      getOrThrow: jest.fn((key: string) => {
        const config: Record<string, string> = {
          AUTH_COOKIE_SECURE: 'true',
          JWT_REFRESH_TTL_SECONDS: '604800',
        };

        return config[key];
      }),
    } as unknown as ConfigService;
    const productionController = new AuthController(
      authService,
      productionConfigService,
    );

    login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      currentUser: {
        id: 'user-id',
        email: 'member@example.com',
        name: 'Member User',
        role: 'Member',
        permissions: ['tasks:read:own'],
      },
    });

    await productionController.login(
      {
        email: 'member@example.com',
        password: 'correct-password',
      },
      response,
    );

    expect(cookie).toHaveBeenCalledWith('refresh_token', 'refresh-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 604800000,
    });
  });

  it('should return the authenticated currentUser', () => {
    const currentUser = {
      id: 'user-id',
      email: 'member@example.com',
      name: 'Member User',
      role: 'Member',
      permissions: ['tasks:read:own'],
    };

    expect(controller.me(currentUser)).toEqual({ currentUser });
  });
});
