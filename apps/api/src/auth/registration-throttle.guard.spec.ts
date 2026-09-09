import { ThrottlerException } from '@nestjs/throttler';
import { RegistrationThrottleGuard } from './registration-throttle.guard';

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

function contextFor(email: string) {
  return {
    getHandler: () => function register() {},
    getClass: () => class RegistrationController {},
    switchToHttp: () => ({
      getRequest: () => ({ ip: '127.0.0.1', body: { email } }),
      getResponse: () => ({ header: jest.fn() }),
    }),
  } as never;
}

function reflector() {
  return { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as never;
}

describe('RegistrationThrottleGuard', () => {
  it('throttles source IP independently from normalized email', async () => {
    const guard = new RegistrationThrottleGuard(
      [
        { name: 'registration-ip', limit: 1, ttl: 60_000 },
        { name: 'registration-email', limit: 100, ttl: 60_000 },
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
    const guard = new RegistrationThrottleGuard(
      [
        { name: 'registration-ip', limit: 100, ttl: 60_000 },
        { name: 'registration-email', limit: 1, ttl: 60_000 },
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

  it('does not consume login throttler buckets', async () => {
    const guard = new RegistrationThrottleGuard(
      [
        { name: 'login-ip', limit: 1, ttl: 60_000 },
        { name: 'registration-ip', limit: 100, ttl: 60_000 },
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
