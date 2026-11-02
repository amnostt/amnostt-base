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

interface PasswordRecoveryTracker {
  ip: string;
  email: string;
}

function selectPasswordRecoveryThrottlers(
  options: ThrottlerModuleOptions,
): ThrottlerModuleOptions {
  const isPasswordRecoveryThrottler = ({ name }: { name?: string }): boolean =>
    name?.startsWith('password-recovery-') ?? false;

  if (Array.isArray(options)) {
    return options.filter(isPasswordRecoveryThrottler);
  }

  return {
    ...options,
    throttlers: options.throttlers.filter(isPasswordRecoveryThrottler),
  };
}

@Injectable()
export class PasswordRecoveryThrottleGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(selectPasswordRecoveryThrottlers(options), storage, reflector);
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req.body as { email?: unknown } | undefined;
    const email =
      typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';

    return Promise.resolve(
      JSON.stringify({ ip, email } satisfies PasswordRecoveryTracker),
    );
  }

  protected generateKey(
    context: ExecutionContext,
    trackerString: string,
    name: string,
  ): string {
    const tracker = JSON.parse(trackerString) as PasswordRecoveryTracker;
    return super.generateKey(
      context,
      name === 'password-recovery-email' ? tracker.email : tracker.ip,
      name,
    );
  }
}
