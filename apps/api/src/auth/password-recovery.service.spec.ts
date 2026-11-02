import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { PasswordRecoveryService } from './password-recovery.service';

const GENERIC_MESSAGE =
  'Si existe una cuenta activa con ese correo, recibirás instrucciones para recuperar el acceso.';

type RecoveryUpsertArgs = {
  create: {
    userId: string;
    tokenHash: string;
    passwordHashFingerprint: string;
    expiresAt: Date;
    consumedAt: null;
  };
  update: {
    tokenHash: string;
    passwordHashFingerprint: string;
    expiresAt: Date;
    consumedAt: null;
  };
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('PasswordRecoveryService', () => {
  const findUser = jest.fn();
  const upsertRecovery = jest.fn();
  const deleteRecovery = jest.fn();
  const transaction = jest.fn();
  const send = jest.fn();
  const getConfig = jest.fn();

  const prisma = {
    user: { findUnique: findUser },
    passwordRecoveryToken: {
      upsert: upsertRecovery,
      deleteMany: deleteRecovery,
    },
    $transaction: transaction,
  } as unknown as PrismaService;
  const mailService = { send } as unknown as MailService;
  const configService = { get: getConfig } as unknown as ConfigService;
  const service = new PasswordRecoveryService(
    prisma,
    mailService,
    configService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    getConfig.mockReturnValue('http://localhost:4200/reset-password');
    findUser.mockResolvedValue(null);
    transaction.mockImplementation(
      async (
        callback: (client: {
          passwordRecoveryToken: { upsert: jest.Mock };
        }) => Promise<unknown>,
      ) => callback({ passwordRecoveryToken: { upsert: upsertRecovery } }),
    );
    upsertRecovery.mockResolvedValue({});
    deleteRecovery.mockResolvedValue({ count: 1 });
    send.mockResolvedValue('mail-id');
  });

  it.each([
    { description: 'a missing account', user: null },
    {
      description: 'an inactive account',
      user: {
        id: 'user-id',
        email: 'inactive@example.com',
        passwordHash: 'stored-password-hash',
        isActive: false,
      },
    },
  ])(
    'returns the generic result for $description without writes or mail',
    async ({ user }) => {
      findUser.mockResolvedValue(user);

      await expect(
        service.requestPasswordRecovery({ email: ' Missing@Example.com ' }),
      ).resolves.toEqual({ message: GENERIC_MESSAGE });

      expect(findUser).toHaveBeenCalledWith({
        where: { email: 'missing@example.com' },
        select: { id: true, email: true, passwordHash: true, isActive: true },
      });
      expect(transaction).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('stores only a token hash bound to the current password and sends the complete reset URL', async () => {
    findUser.mockResolvedValue({
      id: 'user-id',
      email: 'member@example.com',
      passwordHash: 'stored-password-hash',
      isActive: true,
    });

    await expect(
      service.requestPasswordRecovery({ email: ' MEMBER@example.com ' }),
    ).resolves.toEqual({ message: GENERIC_MESSAGE });

    const upsertCalls = upsertRecovery.mock.calls as unknown as Array<
      [RecoveryUpsertArgs]
    >;
    const upsertCall = upsertCalls[0][0];
    const sendCalls = send.mock.calls as unknown as Array<
      [{ to: string; text: string }]
    >;
    const message = sendCalls[0][0];
    const match = message.text.match(/https?:\/\/[^\s]+/);
    expect(match).not.toBeNull();
    const token = new URL(match![0]).searchParams.get('token');

    expect(token).toEqual(expect.stringMatching(/^[A-Za-z0-9_-]{43}$/));
    expect(upsertCall.create.tokenHash).toBe(hash(token!));
    expect(upsertCall.create.tokenHash).not.toContain(token!);
    expect(upsertCall.create.passwordHashFingerprint).toBe(
      hash('stored-password-hash'),
    );
    expect(upsertCall.update).toEqual({
      tokenHash: upsertCall.create.tokenHash,
      passwordHashFingerprint: upsertCall.create.passwordHashFingerprint,
      expiresAt: upsertCall.create.expiresAt,
      consumedAt: null,
    });
    expect(upsertCall.create.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 29 * 60_000,
    );
    expect(upsertCall.create.expiresAt.getTime()).toBeLessThan(
      Date.now() + 31 * 60_000,
    );
    expect(message.to).toBe('member@example.com');
    expect(message.text).not.toContain('stored-password-hash');
    expect(message.text).toContain(
      'http://localhost:4200/reset-password?token=',
    );
  });

  it.each([
    undefined,
    'ftp://localhost/reset-password',
    'https://user:password@example.com/reset-password',
    'https://example.com/reset-password?existing=secret',
    'https://example.com/reset-password#fragment',
  ])(
    'fails closed without issuing a token for unsafe URL configuration: %s',
    async (url) => {
      findUser.mockResolvedValue({
        id: 'user-id',
        email: 'member@example.com',
        passwordHash: 'stored-password-hash',
        isActive: true,
      });
      getConfig.mockReturnValue(url);

      await expect(
        service.requestPasswordRecovery({ email: 'member@example.com' }),
      ).resolves.toEqual({ message: GENERIC_MESSAGE });

      expect(transaction).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('cleans up only its failed-send token and preserves a newer row', async () => {
    findUser.mockResolvedValue({
      id: 'user-id',
      email: 'member@example.com',
      passwordHash: 'stored-password-hash',
      isActive: true,
    });
    send.mockRejectedValue(new Error('provider failure'));

    await expect(
      service.requestPasswordRecovery({ email: 'member@example.com' }),
    ).resolves.toEqual({ message: GENERIC_MESSAGE });

    const upsertCalls = upsertRecovery.mock.calls as unknown as Array<
      [RecoveryUpsertArgs]
    >;
    const upsertCall = upsertCalls[0][0];
    expect(deleteRecovery).toHaveBeenCalledWith({
      where: { tokenHash: upsertCall.create.tokenHash },
    });
  });

  it('retries a serializable issuance after a write conflict', async () => {
    findUser.mockResolvedValue({
      id: 'user-id',
      email: 'member@example.com',
      passwordHash: 'stored-password-hash',
      isActive: true,
    });
    transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(
        async (
          callback: (client: {
            passwordRecoveryToken: { upsert: jest.Mock };
          }) => Promise<unknown>,
        ) => callback({ passwordRecoveryToken: { upsert: upsertRecovery } }),
      );

    await expect(
      service.requestPasswordRecovery({ email: 'member@example.com' }),
    ).resolves.toEqual({ message: GENERIC_MESSAGE });

    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('does not leak provider failures through the generic response', async () => {
    findUser.mockResolvedValue({
      id: 'user-id',
      email: 'member@example.com',
      passwordHash: 'stored-password-hash',
      isActive: true,
    });
    send.mockRejectedValue(new Error('secret provider details and token'));

    await expect(
      service.requestPasswordRecovery({ email: 'member@example.com' }),
    ).resolves.toEqual({ message: GENERIC_MESSAGE });

    expect(send).toHaveBeenCalledTimes(1);
    expect(deleteRecovery).toHaveBeenCalledTimes(1);
  });

  it('uses serializable transactions for replacement', async () => {
    findUser.mockResolvedValue({
      id: 'user-id',
      email: 'member@example.com',
      passwordHash: 'stored-password-hash',
      isActive: true,
    });

    await service.requestPasswordRecovery({ email: 'member@example.com' });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
});
