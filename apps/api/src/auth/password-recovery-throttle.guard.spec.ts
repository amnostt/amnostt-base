import { ThrottlerException } from '@nestjs/throttler';
import { PasswordRecoveryThrottleGuard } from './password-recovery-throttle.guard';

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

function contextFor(email: string, ip = '127.0.0.1') {
  return {
    getHandler: () => function forgotPassword() {},
    getClass: () => class AuthController {},
    switchToHttp: () => ({
      getRequest: () => ({ ip, body: { email } }),
      getResponse: () => ({ header: jest.fn() }),
    }),
  } as never;
}

function reflector() {
  return { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as never;
}

describe('PasswordRecoveryThrottleGuard', () => {
  it('throttles source IP independently from normalized email', async () => {
    const guard = new PasswordRecoveryThrottleGuard(
      [
        { name: 'password-recovery-ip', limit: 1, ttl: 60_000 },
        { name: 'password-recovery-email', limit: 100, ttl: 60_000 },
      ],
      new MemoryStorage(),
      reflector(),
    );
    await guard.onModuleInit();

    await expect(
      guard.canActivate(contextFor('first@example.com')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('second@example.com')),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('throttles normalized email independently from source IP', async () => {
    const guard = new PasswordRecoveryThrottleGuard(
      [
        { name: 'password-recovery-ip', limit: 100, ttl: 60_000 },
        { name: 'password-recovery-email', limit: 1, ttl: 60_000 },
      ],
      new MemoryStorage(),
      reflector(),
    );
    await guard.onModuleInit();

    await expect(
      guard.canActivate(contextFor(' Mixed@Example.com ')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('mixed@example.com')),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('does not consume login or registration throttler buckets', async () => {
    const guard = new PasswordRecoveryThrottleGuard(
      [
        { name: 'login-ip', limit: 1, ttl: 60_000 },
        { name: 'registration-ip', limit: 1, ttl: 60_000 },
        { name: 'password-recovery-ip', limit: 100, ttl: 60_000 },
      ],
      new MemoryStorage(),
      reflector(),
    );
    await guard.onModuleInit();

    await expect(
      guard.canActivate(contextFor('first@example.com')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('second@example.com')),
    ).resolves.toBe(true);
  });
});
