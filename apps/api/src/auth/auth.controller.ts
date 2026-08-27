import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { CurrentUser as CurrentUserDecorator } from './current-user.decorator';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import type { CurrentUser } from './auth.types';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  private readonly cookieSecure: boolean;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    this.cookieSecure = this.getBoolean(configService, 'AUTH_COOKIE_SECURE');
    if (
      configService.get<string>('NODE_ENV') === 'production' &&
      !this.cookieSecure
    ) {
      throw new Error('AUTH_COOKIE_SECURE must be true in production');
    }

    this.refreshTtlSeconds = this.getPositiveInteger(
      configService,
      'JWT_REFRESH_TTL_SECONDS',
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    accessToken: string;
    currentUser: CurrentUser;
  }> {
    const { accessToken, refreshToken, currentUser } =
      await this.authService.login(loginDto);

    response.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.refreshTtlSeconds * 1000,
    });

    return {
      accessToken,
      currentUser,
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUserDecorator() currentUser: CurrentUser): {
    currentUser: CurrentUser;
  } {
    return { currentUser };
  }

  private getBoolean(configService: ConfigService, name: string): boolean {
    const value = configService.getOrThrow<string>(name);

    if (value !== 'true' && value !== 'false') {
      throw new Error(`${name} must be true or false`);
    }

    return value === 'true';
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
}
