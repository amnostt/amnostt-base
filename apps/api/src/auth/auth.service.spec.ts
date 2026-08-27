import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma.service';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { AuthTokenPair } from './auth.types';

describe('AuthService', () => {
  const findUniqueUser = jest.fn();
  const findFirstSession = jest.fn();
  const createSession = jest.fn();
  const signTokenPair = jest.fn();
  const hashRefreshToken = jest.fn();
  const getRefreshTokenExpiresAt = jest.fn();
  let signedSessionId = '';

  const prisma = {
    user: {
      findUnique: findUniqueUser,
    },
    session: {
      findFirst: findFirstSession,
      create: createSession,
    },
  } as unknown as PrismaService;

  const authTokenService = {
    signTokenPair,
    hashRefreshToken,
    getRefreshTokenExpiresAt,
  } as unknown as AuthTokenService;

  const service = new AuthService(prisma, authTokenService);

  beforeEach(() => {
    jest.clearAllMocks();
    signedSessionId = '';
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

  it('should reject an invalid, expired, revoked, or inactive session', async () => {
    findFirstSession.mockResolvedValue(null);

    await expect(
      service.getCurrentUser('user-id', 'session-id'),
    ).rejects.toThrow(new UnauthorizedException('Invalid session'));
  });
});
