import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';

describe('HealthController', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const controller = new HealthController(prisma);

  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('returns liveness without querying the database', () => {
    expect(controller.getHealth()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('returns readiness when the database accepts a query', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.getReadiness()).resolves.toEqual({ status: 'ok' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns a sanitized service-unavailable response when the database is down', async () => {
    queryRaw.mockRejectedValue(new Error('connection password leaked'));

    await expect(controller.getReadiness()).rejects.toEqual(
      new ServiceUnavailableException('Database is unavailable'),
    );
  });
});
