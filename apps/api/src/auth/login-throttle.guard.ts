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
import { normalizeEmail } from './auth.types';

interface LoginTracker {
  ip: string;
  email: string;
}

function selectLoginThrottlers(
  options: ThrottlerModuleOptions,
): ThrottlerModuleOptions {
  const isLoginThrottler = ({ name }: { name?: string }): boolean =>
    name?.startsWith('login-') ?? false;

  if (Array.isArray(options)) {
    return options.filter(isLoginThrottler);
  }

  return {
    ...options,
    throttlers: options.throttlers.filter(isLoginThrottler),
  };
}

@Injectable()
export class LoginThrottleGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(selectLoginThrottlers(options), storage, reflector);
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req.body as { email?: unknown } | undefined;
    const email =
      typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';

    return Promise.resolve(
      JSON.stringify({ ip, email } satisfies LoginTracker),
    );
  }

  protected generateKey(
    context: ExecutionContext,
    trackerString: string,
    name: string,
  ): string {
    const tracker = JSON.parse(trackerString) as LoginTracker;
    return super.generateKey(
      context,
      name === 'login-email' ? tracker.email : tracker.ip,
      name,
    );
  }
}
