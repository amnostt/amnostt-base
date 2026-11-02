import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';

function selectPasswordResetThrottlers(
  options: ThrottlerModuleOptions,
): ThrottlerModuleOptions {
  const isPasswordResetThrottler = ({ name }: { name?: string }): boolean =>
    name?.startsWith('password-reset-') ?? false;

  if (Array.isArray(options)) {
    return options.filter(isPasswordResetThrottler);
  }

  return {
    ...options,
    throttlers: options.throttlers.filter(isPasswordResetThrottler),
  };
}

@Injectable()
export class PasswordResetThrottleGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(selectPasswordResetThrottlers(options), storage, reflector);
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(typeof req.ip === 'string' ? req.ip : 'unknown');
  }

  protected generateKey(
    context: ExecutionContext,
    tracker: string,
    name: string,
  ): string {
    return super.generateKey(context, tracker, name);
  }
}
