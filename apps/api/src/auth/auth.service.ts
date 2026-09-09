import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthTokenService } from './auth-token.service';
import {
  AuthTokenPair,
  AuthTokenPayload,
  CurrentUser,
  LoginResult,
} from './auth.types';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$KsXskZkI6lPb8AGNd7SJdw$WVLMcRB1YjbEIUMKNt0NIcOp38qJhHmPuCRyBX0JGV8';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authTokenService: AuthTokenService,
    private readonly configService: ConfigService,
  ) {}

  async resolveRegistrationRole(): Promise<{
    id: string;
    name: string;
    isPrivileged: boolean;
  }> {
    const roleName = this.configService
      .get<string>('AUTH_REGISTRATION_DEFAULT_ROLE')
      ?.trim();

    if (!roleName) {
      throw new InternalServerErrorException(
        'Registration default role is unavailable or privileged',
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
      select: { id: true, name: true, isPrivileged: true },
    });

    if (!role || role.isPrivileged) {
      throw new InternalServerErrorException(
        'Registration default role is unavailable or privileged',
      );
    }

    return role;
  }

  async login(loginDto: LoginDto): Promise<LoginResult> {
    const email = loginDto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: {
        email,
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

    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(passwordHash, loginDto.password);
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const sessionId = randomUUID();
    const { accessToken, refreshToken } =
      await this.authTokenService.signTokenPair(user.id, sessionId);
    const refreshTokenHash =
      this.authTokenService.hashRefreshToken(refreshToken);
    const expiresAt = this.authTokenService.getRefreshTokenExpiresAt();

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      currentUser: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name,
        permissions: user.role.rolePermissions
          .map(({ permission }) => permission.code)
          .sort(),
      },
    };
  }

  async getCurrentUser(
    userId: string,
    sessionId: string,
  ): Promise<CurrentUser> {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
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

    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role.name,
      permissions: session.user.role.rolePermissions
        .map(({ permission }) => permission.code)
        .sort(),
    };
  }

  async refresh(refreshToken: string | undefined): Promise<AuthTokenPair> {
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const payload =
      await this.authTokenService.verifyRefreshToken(refreshToken);
    const refreshTokenHash =
      this.authTokenService.hashRefreshToken(refreshToken);
    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: {
        id: payload.sid,
      },
      include: {
        user: {
          select: {
            isActive: true,
          },
        },
      },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (
      !this.matchesRefreshTokenHash(session.refreshTokenHash, refreshTokenHash)
    ) {
      await this.revokeSession(payload.sid, payload.sub);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenPair = await this.authTokenService.signTokenPair(
      payload.sub,
      payload.sid,
    );
    const replacementHash = this.authTokenService.hashRefreshToken(
      tokenPair.refreshToken,
    );
    const replacementExpiresAt =
      this.authTokenService.getRefreshTokenExpiresAt(now);

    const rotation = await this.prisma.$transaction((transaction) =>
      transaction.session.updateMany({
        where: {
          id: payload.sid,
          userId: payload.sub,
          refreshTokenHash,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
          user: {
            isActive: true,
          },
        },
        data: {
          refreshTokenHash: replacementHash,
          expiresAt: replacementExpiresAt,
        },
      }),
    );

    if (rotation.count !== 1) {
      await this.revokeSession(payload.sid, payload.sub);
      throw new UnauthorizedException('Invalid refresh token');
    }

    return tokenPair;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    let payload: AuthTokenPayload;
    try {
      payload = await this.authTokenService.verifyRefreshToken(refreshToken);
    } catch {
      return;
    }

    await this.revokeSession(payload.sid, payload.sub);
  }

  private async revokeSession(
    sessionId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private matchesRefreshTokenHash(
    storedHash: string,
    receivedHash: string,
  ): boolean {
    const storedBytes = Buffer.from(storedHash, 'utf8');
    const receivedBytes = Buffer.from(receivedHash, 'utf8');

    return (
      storedBytes.length === receivedBytes.length &&
      timingSafeEqual(storedBytes, receivedBytes)
    );
  }
}
