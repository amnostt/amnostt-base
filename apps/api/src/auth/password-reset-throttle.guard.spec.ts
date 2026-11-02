import { ThrottlerException } from '@nestjs/throttler';
import { PasswordResetThrottleGuard } from './password-reset-throttle.guard';

class MemoryStorage {
  private readonly hits = new Map<string, number>();

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    void ttl;
    void blockDuration;
    void throttlerName;
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    return {
      totalHits,
      timeToExpire: 60,
      isBlocked: totalHits > limit,
      timeToBlockExpire: 60,
    };
  }
}

function contextFor(ip = '127.0.0.1') {
  return {
    getHandler: () => function resetPassword() {},
    getClass: () => class AuthController {},
    switchToHttp: () => ({
      getRequest: () => ({ ip, body: { token: 'a'.repeat(43) } }),
      getResponse: () => ({ header: jest.fn() }),
    }),
  } as never;
}

function reflector() {
  return { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as never;
}

describe('PasswordResetThrottleGuard', () => {
  it('throttles reset requests by IP in its own namespace', async () => {
    const guard = new PasswordResetThrottleGuard(
      [
        { name: 'password-reset-ip', limit: 1, ttl: 60_000 },
        { name: 'password-recovery-ip', limit: 1, ttl: 60_000 },
      ],
      new MemoryStorage(),
      reflector(),
    );
    await guard.onModuleInit();

    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('does not consume recovery, login, or registration buckets', async () => {
    const guard = new PasswordResetThrottleGuard(
      [
        { name: 'login-ip', limit: 1, ttl: 60_000 },
        { name: 'registration-ip', limit: 1, ttl: 60_000 },
        { name: 'password-recovery-ip', limit: 1, ttl: 60_000 },
        { name: 'password-reset-ip', limit: 100, ttl: 60_000 },
      ],
      new MemoryStorage(),
      reflector(),
    );
    await guard.onModuleInit();

    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
  });
});
