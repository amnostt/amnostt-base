import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const login = jest.fn();
  const register = jest.fn();
  const changePassword = jest.fn();
  const refresh = jest.fn();
  const logout = jest.fn();
  const cookie = jest.fn();
  const clearCookie = jest.fn();

  const authService = {
    login,
    register,
    changePassword,
    refresh,
    logout,
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
    clearCookie,
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

  it('should set the login-equivalent refresh cookie for registration', async () => {
    register.mockResolvedValue({
      accessToken: 'registration-access-token',
      refreshToken: 'registration-refresh-token',
      currentUser: {
        id: 'new-user-id',
        email: 'new@example.com',
        name: 'new@example.com',
        role: 'Member',
        permissions: ['tasks:read:own'],
      },
    });

    await expect(
      controller.register(
        { email: 'new@example.com', password: 'a'.repeat(12) },
        response,
      ),
    ).resolves.toEqual({
      accessToken: 'registration-access-token',
      currentUser: {
        id: 'new-user-id',
        email: 'new@example.com',
        name: 'new@example.com',
        role: 'Member',
        permissions: ['tasks:read:own'],
      },
    });

    expect(register).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'a'.repeat(12),
    });
    expect(cookie).toHaveBeenCalledWith(
      'refresh_token',
      'registration-refresh-token',
      {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: 604800000,
      },
    );
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

  it('should rotate the refresh cookie and return only a new access token', async () => {
    refresh.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    await expect(
      controller.refresh(
        { headers: { cookie: 'refresh_token=old-refresh-token' } } as Request,
        response,
      ),
    ).resolves.toEqual({ accessToken: 'new-access-token' });

    expect(refresh).toHaveBeenCalledWith('old-refresh-token');
    expect(cookie).toHaveBeenCalledWith('refresh_token', 'new-refresh-token', {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 604800000,
    });
  });

  it('should reject refresh failures and clear the cookie', async () => {
    refresh.mockRejectedValue(new Error('invalid refresh token'));

    await expect(
      controller.refresh(
        {
          headers: { cookie: 'refresh_token=invalid-refresh-token' },
        } as Request,
        response,
      ),
    ).rejects.toThrow('Invalid refresh token');

    expect(clearCookie).toHaveBeenCalledWith('refresh_token', {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/api/auth',
    });
  });

  it('should make logout idempotent and clear the cookie', async () => {
    await expect(
      controller.logout(
        { headers: { cookie: 'refresh_token=refresh-token' } } as Request,
        response,
      ),
    ).resolves.toBeUndefined();

    expect(logout).toHaveBeenCalledWith('refresh-token');
    expect(clearCookie).toHaveBeenCalledWith('refresh_token', {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/api/auth',
    });

    await expect(
      controller.logout({ headers: {} } as Request, response),
    ).resolves.toBeUndefined();
    expect(logout).toHaveBeenCalledWith(undefined);
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

  it('should change the authenticated password and return no content', async () => {
    changePassword.mockResolvedValue(undefined);
    const currentUser = {
      id: 'user-id',
      email: 'member@example.com',
      name: 'Member User',
      role: 'Member',
      permissions: ['tasks:read:own'],
    };

    await expect(
      controller.changePassword(currentUser, 'session-id', {
        currentPassword: 'correct-password',
        newPassword: 'b'.repeat(12),
      }),
    ).resolves.toBeUndefined();

    expect(changePassword).toHaveBeenCalledWith('user-id', 'session-id', {
      currentPassword: 'correct-password',
      newPassword: 'b'.repeat(12),
    });
  });
});
