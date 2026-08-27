import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentUser as CurrentUserData } from './auth.types';

interface AuthenticatedRequest extends Request {
  user?: CurrentUserData;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserData => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user as CurrentUserData;
  },
);
