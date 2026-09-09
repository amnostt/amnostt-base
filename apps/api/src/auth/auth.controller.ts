import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { CurrentUser as CurrentUserDecorator } from './current-user.decorator';
import { CurrentSessionId } from './current-session-id.decorator';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { CurrentUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegistrationThrottleGuard } from './registration-throttle.guard';
import { LoginThrottleGuard } from './login-throttle.guard';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

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
  @UseGuards(LoginThrottleGuard)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    accessToken: string;
    currentUser: CurrentUser;
  }> {
    const { accessToken, refreshToken, currentUser } =
      await this.authService.login(loginDto);

    this.setRefreshCookie(response, refreshToken);

    return {
      accessToken,
      currentUser,
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RegistrationThrottleGuard)
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    accessToken: string;
    currentUser: CurrentUser;
  }> {
    const { accessToken, refreshToken, currentUser } =
      await this.authService.register(registerDto);

    this.setRefreshCookie(response, refreshToken);

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

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async changePassword(
    @CurrentUserDecorator() currentUser: CurrentUser,
    @CurrentSessionId() sessionId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      currentUser.id,
      sessionId,
      changePasswordDto,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string }> {
    try {
      const { accessToken, refreshToken } = await this.authService.refresh(
        this.getRefreshToken(request),
      );

      this.setRefreshCookie(response, refreshToken);
      return { accessToken };
    } catch {
      this.clearRefreshCookie(response);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.getRefreshToken(request));
    this.clearRefreshCookie(response);
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.refreshTtlSeconds * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
  }

  private getRefreshToken(request: Request): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (typeof cookieHeader !== 'string') {
      return undefined;
    }

    for (const cookie of cookieHeader.split(';')) {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex < 0) {
        continue;
      }

      const name = cookie.slice(0, separatorIndex).trim();
      if (name !== REFRESH_COOKIE_NAME) {
        continue;
      }

      const value = cookie.slice(separatorIndex + 1).trim();
      if (!value) {
        return undefined;
      }

      try {
        return decodeURIComponent(value);
      } catch {
        return undefined;
      }
    }

    return undefined;
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
