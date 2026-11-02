import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { InjectThrottlerOptions } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';

@Injectable()
export class GoogleLoginThrottleGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(selectGoogleLoginThrottler(options), storage, reflector);
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

function selectGoogleLoginThrottler(
  options: ThrottlerModuleOptions,
): ThrottlerModuleOptions {
  const configured = Array.isArray(options) ? options : options.throttlers;
  const existing = configured.find(({ name }) => name === 'google-login-ip');
  return [
    existing ?? {
      name: 'google-login-ip',
      limit: 30,
      ttl: 60_000,
    },
  ];
}
