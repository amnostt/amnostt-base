import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { normalizeEmail } from './auth.types';

interface RegistrationTracker {
  ip: string;
  email: string;
}

@Injectable()
export class RegistrationThrottleGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req.body as { email?: unknown } | undefined;
    const email =
      typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';

    return Promise.resolve(
      JSON.stringify({ ip, email } satisfies RegistrationTracker),
    );
  }

  protected generateKey(
    context: ExecutionContext,
    trackerString: string,
    name: string,
  ): string {
    const tracker = JSON.parse(trackerString) as RegistrationTracker;
    return super.generateKey(
      context,
      name === 'registration-email' ? tracker.email : tracker.ip,
      name,
    );
  }
}
