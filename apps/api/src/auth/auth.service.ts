import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthTokenService } from './auth-token.service';
import { LoginResult } from './auth.types';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$KsXskZkI6lPb8AGNd7SJdw$WVLMcRB1YjbEIUMKNt0NIcOp38qJhHmPuCRyBX0JGV8';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authTokenService: AuthTokenService,
  ) {}

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
}
