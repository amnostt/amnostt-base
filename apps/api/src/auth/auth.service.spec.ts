import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma.service';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { AuthTokenPair } from './auth.types';

describe('AuthService', () => {
  const findUniqueUser = jest.fn();
  const findUniqueRole = jest.fn();
  const findFirstSession = jest.fn();
  const findUniqueSession = jest.fn();
  const createUser = jest.fn();
  const createSession = jest.fn();
  const updateManySession = jest.fn();
  const runTransaction = jest.fn();
  const signTokenPair = jest.fn();
  const hashRefreshToken = jest.fn();
  const getRefreshTokenExpiresAt = jest.fn();
  let signedSessionId = '';

  const prisma = {
    user: {
      findUnique: findUniqueUser,
      create: createUser,
    },
    role: {
      findUnique: findUniqueRole,
    },
    session: {
      findFirst: findFirstSession,
      findUnique: findUniqueSession,
      create: createSession,
      updateMany: updateManySession,
    },
    $transaction: runTransaction,
  } as unknown as PrismaService;

  const authTokenService = {
    signTokenPair,
    hashRefreshToken,
    getRefreshTokenExpiresAt,
    verifyRefreshToken: jest.fn(),
  } as unknown as AuthTokenService;

  const verifyRefreshToken = (
    authTokenService as unknown as { verifyRefreshToken: jest.Mock }
  ).verifyRefreshToken;

  const getConfigValue = jest.fn((key: string) =>
    key === 'AUTH_REGISTRATION_DEFAULT_ROLE' ? 'Member' : undefined,
  );
  const configService = {
    get: getConfigValue,
  } as unknown as ConfigService;

  const service = new AuthService(prisma, authTokenService, configService);

  beforeEach(() => {
    jest.clearAllMocks();
    runTransaction.mockReset();
    signedSessionId = '';
    getConfigValue.mockImplementation((key: string) =>
      key === 'AUTH_REGISTRATION_DEFAULT_ROLE' ? 'Member' : undefined,
    );
    runTransaction.mockImplementation(
      async (
        callback: (transaction: {
          session: { updateMany: jest.Mock };
        }) => Promise<unknown>,
      ): Promise<unknown> =>
        callback({ session: { updateMany: updateManySession } }),
    );
  });

  it('should reject an unknown email without creating a session', async () => {
    findUniqueUser.mockResolvedValue(null);

    await expect(
      service.login({
        email: ' Missing@Example.com ',
        password: 'incorrect-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(findUniqueUser).toHaveBeenCalledWith({
      where: {
        email: 'missing@example.com',
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });
    expect(signTokenPair).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: 'an incorrect password',
      isActive: true,
      password: 'incorrect-password',
    },
    {
      description: 'an inactive account',
      isActive: false,
      password: 'correct-password',
    },
  ])(
    'should reject $description without creating a session',
    async ({ isActive, password }) => {
      const passwordHash = await argon2.hash('correct-password', {
        type: argon2.argon2id,
      });

      findUniqueUser.mockResolvedValue({
        id: 'user-id',
        email: 'member@example.com',
        name: 'Member User',
        passwordHash,
        isActive,
        role: {
          name: 'Member',
          rolePermissions: [],
        },
      });

      await expect(
        service.login({
          email: 'member@example.com',
          password,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(signTokenPair).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    },
  );

  it('should reject a malformed stored password hash without creating a session', async () => {
    findUniqueUser.mockResolvedValue({
      id: 'user-id',
      email: 'member@example.com',
      name: 'Member User',
      passwordHash: 'malformed-password-hash',
      isActive: true,
      role: {
        name: 'Member',
        rolePermissions: [],
      },
    });

    await expect(
      service.login({
        email: 'member@example.com',
        password: 'correct-password',
      }),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

    expect(signTokenPair).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('should create a session and return tokens with currentUser', async () => {
    const passwordHash = await argon2.hash('correct-password', {
      type: argon2.argon2id,
    });
    const expiresAt = new Date('2026-01-08T00:00:00.000Z');

    findUniqueUser.mockResolvedValue({
      id: 'user-id',
      email: 'member@example.com',
      name: 'Member User',
      passwordHash,
      isActive: true,
      role: {
        name: 'Member',
        rolePermissions: [
          {
            permission: {
              code: 'tasks:read:own',
            },
          },
          {
            permission: {
              code: 'tasks:create:own',
            },
          },
        ],
      },
    });
    signTokenPair.mockImplementation(
      (_userId: string, sessionId: string): Promise<AuthTokenPair> => {
        signedSessionId = sessionId;

        return Promise.resolve({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        });
      },
    );
    hashRefreshToken.mockReturnValue('refresh-token-hash');
    getRefreshTokenExpiresAt.mockReturnValue(expiresAt);
    createSession.mockResolvedValue({});

    await expect(
      service.login({
        email: 'MEMBER@example.com',
        password: 'correct-password',
      }),
    ).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      currentUser: {
        id: 'user-id',
        email: 'member@example.com',
        name: 'Member User',
        role: 'Member',
        permissions: ['tasks:create:own', 'tasks:read:own'],
      },
    });

    expect(signTokenPair).toHaveBeenCalledWith('user-id', expect.any(String));

    expect(createSession).toHaveBeenCalledWith({
      data: {
        id: signedSessionId,
        userId: 'user-id',
        refreshTokenHash: 'refresh-token-hash',
        expiresAt,
      },
    });
  });

  describe('registration', () => {
    const registrationInput = {
      email: ' New@Example.com ',
      password: 'a'.repeat(12),
    };

    const configureRegistrationTransaction = () => {
      runTransaction.mockImplementation(
        async (
          callback: (transaction: {
            role: { findUnique: jest.Mock };
            user: { create: jest.Mock };
            session: { create: jest.Mock };
          }) => Promise<unknown>,
        ) =>
          callback({
            role: { findUnique: findUniqueRole },
            user: { create: createUser },
            session: { create: createSession },
          }),
      );
    };

    beforeEach(() => {
      findUniqueUser.mockResolvedValue(null);
      findUniqueRole.mockResolvedValue({
        id: 'member-role-id',
        name: 'Member',
        isPrivileged: false,
      });
      createUser.mockResolvedValue({
        id: 'new-user-id',
        email: 'new@example.com',
        name: 'new@example.com',
        role: {
          name: 'Member',
          rolePermissions: [{ permission: { code: 'tasks:read:own' } }],
        },
      });
      createSession.mockResolvedValue({});
      signTokenPair.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      hashRefreshToken.mockReturnValue('refresh-token-hash');
      getRefreshTokenExpiresAt.mockReturnValue(
        new Date('2026-01-08T00:00:00.000Z'),
      );
      configureRegistrationTransaction();
    });

    it('normalizes the email, assigns the safe role, creates one session, and returns login-equivalent tokens', async () => {
      await expect(service.register(registrationInput)).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        currentUser: {
          id: 'new-user-id',
          email: 'new@example.com',
          name: 'new@example.com',
          role: 'Member',
          permissions: ['tasks:read:own'],
        },
      });

      expect(findUniqueUser).toHaveBeenCalledWith({
        where: { email: 'new@example.com' },
        select: { id: true },
      });
      expect(createUser).toHaveBeenCalledWith({
        data: {
          email: 'new@example.com',
          name: 'new@example.com',
          passwordHash: expect.any(String) as string,
          roleId: 'member-role-id',
        },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      });
      expect(createSession).toHaveBeenCalledWith({
        data: {
          id: expect.any(String) as string,
          userId: 'new-user-id',
          refreshTokenHash: 'refresh-token-hash',
          expiresAt: new Date('2026-01-08T00:00:00.000Z'),
        },
      });
    });

    it('returns conflict for a normalized duplicate without creating a user or session', async () => {
      findUniqueUser.mockResolvedValue({ id: 'existing-user-id' });

      await expect(
        service.register({
          email: ' EXISTING@example.com ',
          password: 'a'.repeat(12),
        }),
      ).rejects.toEqual(new ConflictException('Email is already registered'));

      expect(runTransaction).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    });

    it('fails safely for an unavailable default role without writing user or session data', async () => {
      getConfigValue.mockReturnValue('Missing Role');
      findUniqueRole.mockResolvedValue(null);

      await expect(service.register(registrationInput)).rejects.toEqual(
        new InternalServerErrorException(
          'Registration default role is unavailable or privileged',
        ),
      );

      expect(createUser).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    });

    it('retries a serializable transaction once after P2034 and then succeeds', async () => {
      runTransaction
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce(
          async (
            callback: (transaction: {
              role: { findUnique: jest.Mock };
              user: { create: jest.Mock };
              session: { create: jest.Mock };
            }) => Promise<unknown>,
          ) =>
            callback({
              role: { findUnique: findUniqueRole },
              user: { create: createUser },
              session: { create: createSession },
            }),
        );

      await expect(service.register(registrationInput)).resolves.toEqual(
        expect.objectContaining({ accessToken: 'access-token' }),
      );
      expect(runTransaction).toHaveBeenCalledTimes(2);
    });
  });

  it('should resolve currentUser from an active session and current permissions', async () => {
    findFirstSession.mockResolvedValue({
      user: {
        id: 'user-id',
        email: 'member@example.com',
        name: 'Member User',
        role: {
          name: 'Member',
          rolePermissions: [
            {
              permission: {
                code: 'tasks:read:own',
              },
            },
            {
              permission: {
                code: 'tasks:create:own',
              },
            },
          ],
        },
      },
    });

    await expect(
      service.getCurrentUser('user-id', 'session-id'),
    ).resolves.toEqual({
      id: 'user-id',
      email: 'member@example.com',
      name: 'Member User',
      role: 'Member',
      permissions: ['tasks:create:own', 'tasks:read:own'],
    });

    expect(findFirstSession).toHaveBeenCalledWith({
      where: {
        id: 'session-id',
        userId: 'user-id',
        revokedAt: null,
        expiresAt: {
          gt: expect.any(Date) as Date,
        },
        user: {
          isActive: true,
        },
      },
      include: {
        user: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  describe('registration default role', () => {
    it('should resolve a configured non-privileged role by classification', async () => {
      findUniqueRole.mockResolvedValue({
        id: 'member-role-id',
        name: 'Member',
        isPrivileged: false,
      });

      await expect(service.resolveRegistrationRole()).resolves.toEqual({
        id: 'member-role-id',
        name: 'Member',
        isPrivileged: false,
      });

      expect(findUniqueRole).toHaveBeenCalledWith({
        where: { name: 'Member' },
        select: { id: true, name: true, isPrivileged: true },
      });
    });

    it.each([
      {
        description: 'missing configuration',
        configuredRole: undefined,
        role: null,
      },
      {
        description: 'an unseeded role',
        configuredRole: 'Future Member',
        role: null,
      },
      {
        description: 'a privileged role',
        configuredRole: 'Admin',
        role: { id: 'admin-role-id', name: 'Admin', isPrivileged: true },
      },
      {
        description: 'an unknown role classified as privileged',
        configuredRole: 'Renamed Admin',
        role: {
          id: 'renamed-admin-role-id',
          name: 'Renamed Admin',
          isPrivileged: true,
        },
      },
    ])(
      'should reject $description before any user or session write',
      async ({ configuredRole, role }) => {
        getConfigValue.mockReturnValue(configuredRole);
        findUniqueRole.mockResolvedValue(role);

        await expect(service.resolveRegistrationRole()).rejects.toEqual(
          new InternalServerErrorException(
            'Registration default role is unavailable or privileged',
          ),
        );

        expect(createUser).not.toHaveBeenCalled();
        expect(createSession).not.toHaveBeenCalled();
      },
    );
  });

  it('should reject an invalid, expired, revoked, or inactive session', async () => {
    findFirstSession.mockResolvedValue(null);

    await expect(
      service.getCurrentUser('user-id', 'session-id'),
    ).rejects.toThrow(new UnauthorizedException('Invalid session'));
  });

  describe('refresh', () => {
    const currentSession = {
      userId: 'user-id',
      refreshTokenHash: 'stored-refresh-token-hash',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      revokedAt: null,
      user: { isActive: true },
    };

    beforeEach(() => {
      verifyRefreshToken.mockResolvedValue({
        sub: 'user-id',
        sid: 'session-id',
        type: 'refresh',
      });
      hashRefreshToken.mockImplementation((token: string) =>
        token === 'refresh-token'
          ? 'stored-refresh-token-hash'
          : 'replacement-refresh-token-hash',
      );
      findUniqueSession.mockResolvedValue(currentSession);
      signTokenPair.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
      getRefreshTokenExpiresAt.mockReturnValue(
        new Date('2099-01-08T00:00:00.000Z'),
      );
      updateManySession.mockResolvedValue({ count: 1 });
    });

    it('should rotate the refresh token and persist it with an atomic compare-and-update', async () => {
      await expect(service.refresh('refresh-token')).resolves.toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      expect(verifyRefreshToken).toHaveBeenCalledWith('refresh-token');
      expect(findUniqueSession).toHaveBeenCalledWith({
        where: { id: 'session-id' },
        include: { user: { select: { isActive: true } } },
      });
      expect(signTokenPair).toHaveBeenCalledWith('user-id', 'session-id');
      expect(runTransaction).toHaveBeenCalled();
      expect(updateManySession).toHaveBeenCalledWith({
        where: {
          id: 'session-id',
          userId: 'user-id',
          refreshTokenHash: 'stored-refresh-token-hash',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) as Date },
          user: { isActive: true },
        },
        data: {
          refreshTokenHash: 'replacement-refresh-token-hash',
          expiresAt: new Date('2099-01-08T00:00:00.000Z'),
        },
      });
    });

    it('should revoke the session when a rotated token is reused', async () => {
      findUniqueSession.mockResolvedValue({
        ...currentSession,
        refreshTokenHash: 'current-refresh-token-hash',
      });
      hashRefreshToken.mockReturnValue('old-refresh-token-hash');

      await expect(service.refresh('old-refresh-token')).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(signTokenPair).not.toHaveBeenCalled();
      expect(updateManySession).toHaveBeenCalledWith({
        where: {
          id: 'session-id',
          userId: 'user-id',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('should revoke the session when an atomic rotation loses a race', async () => {
      updateManySession
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      await expect(service.refresh('refresh-token')).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(updateManySession).toHaveBeenCalledTimes(2);
    });

    it.each([undefined, 'invalid-refresh-token'])(
      'should reject a missing or invalid refresh credential',
      async (token) => {
        if (token === 'invalid-refresh-token') {
          verifyRefreshToken.mockRejectedValue(
            new UnauthorizedException('Invalid refresh token'),
          );
        }

        await expect(service.refresh(token)).rejects.toThrow(
          new UnauthorizedException('Invalid refresh token'),
        );

        expect(findUniqueSession).not.toHaveBeenCalled();
        expect(signTokenPair).not.toHaveBeenCalled();
      },
    );

    it.each([
      { ...currentSession, revokedAt: new Date() },
      { ...currentSession, expiresAt: new Date('2000-01-01T00:00:00.000Z') },
      { ...currentSession, user: { isActive: false } },
      { ...currentSession, userId: 'another-user-id' },
      null,
    ])('should reject an inactive or wrong session', async (session) => {
      findUniqueSession.mockResolvedValue(session);

      await expect(service.refresh('refresh-token')).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );

      expect(signTokenPair).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should revoke an identifiable session without requiring an access token', async () => {
      verifyRefreshToken.mockResolvedValue({
        sub: 'user-id',
        sid: 'session-id',
        type: 'refresh',
      });
      updateManySession.mockResolvedValue({ count: 1 });

      await expect(service.logout('refresh-token')).resolves.toBeUndefined();

      expect(updateManySession).toHaveBeenCalledWith({
        where: {
          id: 'session-id',
          userId: 'user-id',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('should ignore missing or invalid credentials', async () => {
      verifyRefreshToken.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(service.logout(undefined)).resolves.toBeUndefined();
      await expect(
        service.logout('invalid-refresh-token'),
      ).resolves.toBeUndefined();

      expect(updateManySession).not.toHaveBeenCalled();
    });
  });
});
