import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { CurrentUser } from './auth.types';

interface AuthenticatedRequest extends Request {
  user?: CurrentUser;
  sessionId?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authTokenService: AuthTokenService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token =
      request.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = await this.authTokenService.verifyAccessToken(token);

      request.sessionId = payload.sid;
      request.user = await this.authService.getCurrentUser(
        payload.sub,
        payload.sid,
      );

      return true;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }
}
