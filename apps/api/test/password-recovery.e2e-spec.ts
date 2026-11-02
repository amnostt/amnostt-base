import { createHash, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { AuthTokenService } from './../src/auth/auth-token.service';
import { configureApp } from './../src/app.setup';
import { MailService } from './../src/mail/mail.service';
import { PASSWORD_RESET_ERROR } from './../src/auth/password-recovery.service';
import { PrismaClient } from './../src/generated/prisma/client';
import { PrismaService } from './../src/prisma.service';

const GENERIC_MESSAGE =
  'Si existe una cuenta activa con ese correo, recibirás instrucciones para recuperar el acceso.';
const CURRENT_PASSWORD = 'test-password-123';
const RESET_PASSWORD = 'new-password-123';

interface SuccessResponse {
  data: { message: string };
}

interface AccessTokenResponse {
  data: { accessToken: string };
}

interface ErrorResponse {
  error: { code: string; message: string };
}

type TransactionCallback = (transaction: object) => Promise<unknown>;
type TransactionRunner = {
  $transaction: (
    callback: TransactionCallback,
    options?: unknown,
  ) => Promise<unknown>;
};

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenFromMail(text: string): string {
  const url = text.match(/https?:\/\/[^\s]+/)?.[0];
  expect(url).toEqual(expect.any(String));
  return new URL(url!).searchParams.get('token')!;
}

describe('Password recovery request (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mail: { send: jest.Mock };
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

  async function createUser(active = true): Promise<{
    id: string;
    email: string;
    passwordHash: string;
  }> {
    const email = `${randomUUID()}@example.com`;
    const passwordHash = await argon2.hash('test-password-123', {
      type: argon2.argon2id,
    });
    const role = await prisma.role.create({
      data: {
        name: `Recovery ${randomUUID()}`,
        isPrivileged: false,
      },
    });
    createdRoleIds.push(role.id);
    const user = await prisma.user.create({
      data: {
        email,
        name: email,
        passwordHash,
        isActive: active,
        roleId: role.id,
      },
    });
    createdUserIds.push(user.id);
    return { id: user.id, email, passwordHash };
  }

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'recovery-test-access-secret-32-characters';
    process.env.JWT_REFRESH_SECRET =
      'recovery-test-refresh-secret-32-characters';
    process.env.JWT_ACCESS_TTL_SECONDS = '900';
    process.env.JWT_REFRESH_TTL_SECONDS = '604800';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_REGISTRATION_DEFAULT_ROLE = 'Member';
    process.env.AUTH_REGISTRATION_IP_LIMIT = '100';
    process.env.AUTH_REGISTRATION_IP_TTL_SECONDS = '900';
    process.env.AUTH_REGISTRATION_EMAIL_LIMIT = '100';
    process.env.AUTH_REGISTRATION_EMAIL_TTL_SECONDS = '900';
    process.env.AUTH_LOGIN_IP_LIMIT = '100';
    process.env.AUTH_LOGIN_IP_TTL_SECONDS = '900';
    process.env.AUTH_LOGIN_EMAIL_LIMIT = '100';
    process.env.AUTH_LOGIN_EMAIL_TTL_SECONDS = '900';
    process.env.AUTH_PASSWORD_RECOVERY_IP_LIMIT = '100';
    process.env.AUTH_PASSWORD_RECOVERY_IP_TTL_SECONDS = '900';
    process.env.AUTH_PASSWORD_RECOVERY_EMAIL_LIMIT = '3';
    process.env.AUTH_PASSWORD_RECOVERY_EMAIL_TTL_SECONDS = '900';
    process.env.AUTH_PASSWORD_RESET_IP_LIMIT = '100';
    process.env.AUTH_PASSWORD_RESET_IP_TTL_SECONDS = '900';
    process.env.AUTH_PASSWORD_RESET_URL =
      'http://localhost:4200/reset-password';
    process.env.MAIL_FROM = 'no-reply@example.com';
    process.env.RESEND_API_KEY = 'test-only-resend-key';

    mail = { send: jest.fn() };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    configureApp(app, app.get(ConfigService));
    await app.init();
  });

  async function issueToken(user: { email: string }): Promise<string> {
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: user.email })
      .expect(200);

    const mailCalls = mail.send.mock.calls as unknown as Array<
      [{ text: string }]
    >;
    return tokenFromMail(mailCalls.at(-1)![0].text);
  }

  function refreshCookie(response: Response): string {
    const cookies = response.headers['set-cookie'] as string[] | undefined;
    const cookie = cookies?.find((value) => value.startsWith('refresh_token='));
    expect(cookie).toEqual(expect.any(String));
    return cookie!;
  }

  function expectClearedCookie(response: Response): void {
    const cookies = response.headers['set-cookie'] as string[] | undefined;
    expect(
      cookies?.find((value) => value.startsWith('refresh_token=')),
    ).toEqual(expect.stringContaining('Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
  }

  async function login(
    email: string,
    password = CURRENT_PASSWORD,
  ): Promise<{
    accessToken: string;
    refreshCookie: string;
  }> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const body = response.body as AccessTokenResponse;
    return {
      accessToken: body.data.accessToken,
      refreshCookie: refreshCookie(response),
    };
  }

  function barrierAfterRecoveryRead(token: string): {
    read: Promise<void>;
    restore: () => void;
  } {
    const targetHash = tokenHash(token);
    const originalTransaction = (
      PrismaClient.prototype as unknown as TransactionRunner
    ).$transaction.bind(prisma);
    let readResolve!: () => void;
    let signaled = false;
    const read = new Promise<void>((resolve) => {
      readResolve = resolve;
    });
    const spy = jest
      .spyOn(prisma, '$transaction')
      .mockImplementation((callback: unknown, options: unknown) => {
        const runCallback = callback as TransactionCallback;
        return originalTransaction(async (transaction) => {
          const wrappedTransaction = new Proxy(transaction, {
            get(target, property, receiver) {
              if (property !== 'passwordRecoveryToken') {
                return Reflect.get(target, property, receiver) as unknown;
              }

              const recoveryDelegate = Reflect.get(
                target,
                property,
                receiver,
              ) as object;
              return new Proxy(recoveryDelegate, {
                get(delegate, delegateProperty, delegateReceiver) {
                  if (delegateProperty !== 'findUnique') {
                    return Reflect.get(
                      delegate,
                      delegateProperty,
                      delegateReceiver,
                    ) as unknown;
                  }

                  const findUnique = Reflect.get(
                    delegate,
                    delegateProperty,
                    delegateReceiver,
                  ) as (args: unknown) => Promise<unknown>;
                  return async (args: unknown) => {
                    const result = await findUnique.call(delegate, args);
                    const where =
                      typeof args === 'object' &&
                      args !== null &&
                      'where' in args
                        ? (args as { where?: { tokenHash?: unknown } }).where
                        : undefined;
                    if (!signaled && where?.tokenHash === targetHash) {
                      signaled = true;
                      readResolve();
                    }
                    return result;
                  };
                },
              });
            },
          });

          return runCallback(wrappedTransaction);
        }, options);
      });

    return { read, restore: () => spy.mockRestore() };
  }

  beforeEach(() => {
    mail.send.mockReset();
    mail.send.mockResolvedValue('test-mail-id');
  });

  it('returns the same wrapped response for active, inactive, and missing accounts', async () => {
    const active = await createUser(true);
    const inactive = await createUser(false);
    const beforeSessions = await prisma.session.count({
      where: { userId: { in: [active.id, inactive.id] } },
    });

    for (const email of [
      active.email,
      inactive.email,
      `missing-${randomUUID()}@example.com`,
    ]) {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email })
        .expect(200)
        .expect({ data: { message: GENERIC_MESSAGE } });
    }

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(
      await prisma.passwordRecoveryToken.count({
        where: { userId: active.id },
      }),
    ).toBe(1);
    expect(
      await prisma.passwordRecoveryToken.count({
        where: { userId: inactive.id },
      }),
    ).toBe(0);
    expect(
      await prisma.session.count({
        where: { userId: { in: [active.id, inactive.id] } },
      }),
    ).toBe(beforeSessions);
  });

  it('enforces the normalized email limit with an exact wrapped 429 and no state changes', async () => {
    const user = await createUser();
    const beforePassword = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    const beforeSessions = await prisma.session.count({
      where: { userId: user.id },
    });

    for (const email of [
      user.email,
      ` ${user.email.toUpperCase()} `,
      user.email.toLowerCase(),
    ]) {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email })
        .expect(200)
        .expect({ data: { message: GENERIC_MESSAGE } });
    }

    const beforeRejectedRequest =
      await prisma.passwordRecoveryToken.findUniqueOrThrow({
        where: { userId: user.id },
      });
    const rejectedResponse = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: ` ${user.email.toUpperCase()} ` })
      .expect(429);

    expect(rejectedResponse.body).toEqual({
      error: {
        code: 'HTTP_ERROR',
        message: 'ThrottlerException: Too Many Requests',
      },
    });
    expect(mail.send).toHaveBeenCalledTimes(3);
    expect(
      await prisma.passwordRecoveryToken.findUniqueOrThrow({
        where: { userId: user.id },
      }),
    ).toEqual(beforeRejectedRequest);
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      }),
    ).resolves.toEqual(beforePassword);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
      beforeSessions,
    );

    const missingEmail = `missing-limit-${randomUUID()}@example.com`;
    for (const email of [
      missingEmail,
      ` ${missingEmail.toUpperCase()} `,
      missingEmail.toLowerCase(),
    ]) {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email })
        .expect(200)
        .expect({ data: { message: GENERIC_MESSAGE } });
    }

    const missingRejectedResponse = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: ` ${missingEmail.toUpperCase()} ` })
      .expect(429);
    expect(missingRejectedResponse.body).toEqual({
      error: {
        code: 'HTTP_ERROR',
        message: 'ThrottlerException: Too Many Requests',
      },
    });
    expect(mail.send).toHaveBeenCalledTimes(3);
  });

  it('normalizes email, stores only a token hash with a 30-minute TTL, and never returns the token', async () => {
    const user = await createUser();
    const response = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: ` ${user.email.toUpperCase()} ` })
      .expect(200);
    const body = response.body as SuccessResponse;
    const mailCalls = mail.send.mock.calls as unknown as Array<
      [{ text: string }]
    >;
    const sentText = mailCalls[0][0].text;
    const token = tokenFromMail(sentText);
    const row = await prisma.passwordRecoveryToken.findUniqueOrThrow({
      where: { userId: user.id },
    });

    expect(body).toEqual({ data: { message: GENERIC_MESSAGE } });
    expect(JSON.stringify(body)).not.toContain(token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row.tokenHash).toBe(tokenHash(token));
    expect(row.tokenHash).not.toContain(token);
    expect(row.passwordHashFingerprint).toBe(tokenHash(user.passwordHash));
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(row.expiresAt.getTime()).toBeLessThan(Date.now() + 31 * 60_000);
  });

  it('fails closed for provider failure and configured URL failure without exposing the account state', async () => {
    const providerFailureUser = await createUser();
    mail.send.mockRejectedValueOnce(new Error('provider secret and token'));

    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: providerFailureUser.email })
      .expect(200)
      .expect({ data: { message: GENERIC_MESSAGE } });

    expect(
      await prisma.passwordRecoveryToken.count({
        where: { userId: providerFailureUser.id },
      }),
    ).toBe(0);

    const configFailureUser = await createUser();
    const previousUrl = process.env.AUTH_PASSWORD_RESET_URL;
    process.env.AUTH_PASSWORD_RESET_URL = '';
    try {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: configFailureUser.email })
        .expect(200)
        .expect({ data: { message: GENERIC_MESSAGE } });
    } finally {
      process.env.AUTH_PASSWORD_RESET_URL = previousUrl;
    }

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(
      await prisma.passwordRecoveryToken.count({
        where: { userId: configFailureUser.id },
      }),
    ).toBe(0);
  });

  it('keeps the latest concurrent issuance and does not leave a failed token row', async () => {
    const user = await createUser();
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: user.email }),
      request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: user.email }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 200]);
    expect(mail.send).toHaveBeenCalledTimes(2);
    const mailCalls = mail.send.mock.calls as unknown as Array<
      [{ text: string }]
    >;
    const sentTokens = mailCalls.map(([message]) =>
      tokenFromMail(message.text),
    );
    const current = await prisma.passwordRecoveryToken.findUniqueOrThrow({
      where: { userId: user.id },
    });

    expect(sentTokens).toHaveLength(2);
    expect(new Set(sentTokens).size).toBe(2);
    expect(sentTokens.map(tokenHash)).toContain(current.tokenHash);
  });

  it('resets successfully, clears the cookie, revokes all sessions, and requires the new password', async () => {
    const user = await createUser();
    const firstSession = await login(user.email);
    const secondSession = await login(user.email);
    const token = await issueToken(user);

    const response = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, newPassword: RESET_PASSWORD })
      .expect(204);

    expect(response.text).toBe('');
    expectClearedCookie(response);
    expect(response.headers['set-cookie']).toHaveLength(1);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${firstSession.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${secondSession.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', firstSession.refreshCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', secondSession.refreshCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: CURRENT_PASSWORD })
      .expect(401);
    await login(user.email, RESET_PASSWORD);
  });

  it('rejects a replay without changing the password or sessions', async () => {
    const user = await createUser();
    const session = await login(user.email);
    const token = await issueToken(user);

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, newPassword: RESET_PASSWORD })
      .expect(204);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    const beforeSessions = await prisma.session.count({
      where: { userId: user.id, revokedAt: null },
    });

    const replay = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'another-password-123' })
      .expect(401);
    expect(replay.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: PASSWORD_RESET_ERROR },
    });
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      }),
    ).resolves.toEqual(before);
    expect(
      await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(beforeSessions);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
  });

  it.each([11, 129])(
    'rejects a %s-character reset password before consuming the token',
    async (length) => {
      const user = await createUser();
      const token = await issueToken(user);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'b'.repeat(length) })
        .expect(400);
      expect((response.body as ErrorResponse).error.code).toBe(
        'VALIDATION_FAILED',
      );
      await expect(
        prisma.passwordRecoveryToken.findUniqueOrThrow({
          where: { userId: user.id },
          select: { consumedAt: true },
        }),
      ).resolves.toEqual({ consumedAt: null });
      await expect(
        prisma.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { passwordHash: true },
        }),
      ).resolves.toEqual(before);
    },
  );

  it('rejects malformed, unknown, expired, inactive, and password-stale tokens generically', async () => {
    const malformedUser = await createUser();
    const unknownUser = await createUser();
    const expiredUser = await createUser();
    const inactiveUser = await createUser(false);
    const staleUser = await createUser();
    const activeSessions = new Map<string, string>();
    for (const user of [malformedUser, unknownUser, expiredUser, staleUser]) {
      const session = await login(user.email);
      activeSessions.set(user.id, session.accessToken);
    }
    const rows = [
      {
        userId: expiredUser.id,
        token: 'e'.repeat(43),
        expiresAt: new Date(Date.now() - 1_000),
        user: expiredUser,
      },
      {
        userId: inactiveUser.id,
        token: 'i'.repeat(43),
        expiresAt: new Date(Date.now() + 60_000),
        user: inactiveUser,
      },
    ];
    for (const row of rows) {
      await prisma.passwordRecoveryToken.create({
        data: {
          userId: row.userId,
          tokenHash: tokenHash(row.token),
          passwordHashFingerprint: tokenHash(row.user.passwordHash),
          expiresAt: row.expiresAt,
        },
      });
    }
    const staleToken = await issueToken(staleUser);
    await prisma.user.update({
      where: { id: staleUser.id },
      data: { passwordHash: await argon2.hash('stale-password-123') },
    });

    const cases = [
      { user: malformedUser, token: 'not-a-recovery-token' },
      { user: unknownUser, token: 'u'.repeat(43) },
      { user: expiredUser, token: 'e'.repeat(43) },
      { user: inactiveUser, token: 'i'.repeat(43) },
      { user: staleUser, token: staleToken },
    ];
    for (const { user, token } of cases) {
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      });
      const sessionsBefore = await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      });
      const response = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token, newPassword: RESET_PASSWORD })
        .expect(401);
      expect(response.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: PASSWORD_RESET_ERROR },
      });
      await expect(
        prisma.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { passwordHash: true },
        }),
      ).resolves.toEqual(before);
      expect(
        await prisma.session.count({
          where: { userId: user.id, revokedAt: null },
        }),
      ).toBe(sessionsBefore);
      const accessToken = activeSessions.get(user.id);
      if (accessToken) {
        await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      }
    }
  });

  it('accepts a 128-character reset password', async () => {
    const user = await createUser();
    const token = await issueToken(user);

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'b'.repeat(128) })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: 'b'.repeat(128) })
      .expect(200);
  });

  it('invalidates the first link when a newer link is issued', async () => {
    const user = await createUser();
    const firstToken = await issueToken(user);
    const secondToken = await issueToken(user);

    const firstResponse = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: firstToken, newPassword: RESET_PASSWORD })
      .expect(401);
    expect(firstResponse.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: PASSWORD_RESET_ERROR },
    });
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: secondToken, newPassword: RESET_PASSWORD })
      .expect(204);
  });

  it('invalidates pending links during authenticated change while preserving the caller session', async () => {
    const user = await createUser();
    const token = await issueToken(user);
    const session = await login(user.email);

    await request(app.getHttpServer())
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: RESET_PASSWORD })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'another-password-123' })
      .expect(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: PASSWORD_RESET_ERROR },
    });
  });

  it('rejects a late old-password login after reset wins the persistence overlap', async () => {
    const user = await createUser();
    const token = await issueToken(user);
    const authTokenService = Reflect.get(
      app.get(AuthService),
      'authTokenService',
    ) as AuthTokenService;
    const originalSign = authTokenService.signTokenPair.bind(authTokenService);
    let release!: () => void;
    let enteredResolve!: () => void;
    let paused = false;
    const entered = new Promise<void>((resolve) => {
      enteredResolve = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const signSpy = jest
      .spyOn(authTokenService, 'signTokenPair')
      .mockImplementation(async (userId, sessionId) => {
        if (userId === user.id && !paused) {
          paused = true;
          enteredResolve();
          await gate;
        }
        return originalSign.call(authTokenService, userId, sessionId);
      });
    let transactionBarrier:
      ReturnType<typeof barrierAfterRecoveryRead> | undefined;

    try {
      const loginPromise = request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: CURRENT_PASSWORD })
        .then((response) => response);
      await entered;
      transactionBarrier = barrierAfterRecoveryRead(token);
      const resetPromise = request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token, newPassword: RESET_PASSWORD })
        .then((response) => response);
      await transactionBarrier.read;
      release();
      const resetResponse = await resetPromise;
      expect(resetResponse.status).toBe(204);
      const loginResponse = await loginPromise;
      if (loginResponse.status === 200) {
        await request(app.getHttpServer())
          .get('/api/auth/me')
          .set(
            'Authorization',
            `Bearer ${(loginResponse.body as AccessTokenResponse).data.accessToken}`,
          )
          .expect(401);
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', refreshCookie(loginResponse))
          .expect(401);
      } else {
        expect(loginResponse.status).toBe(401);
        expect(loginResponse.headers['set-cookie'] ?? []).toEqual([]);
      }
    } finally {
      release();
      transactionBarrier?.restore();
      signSpy.mockRestore();
    }

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: CURRENT_PASSWORD })
      .expect(401);
    await login(user.email, RESET_PASSWORD);
  });

  it('rejects refresh after reset wins the persistence overlap', async () => {
    const user = await createUser();
    const session = await login(user.email);
    const token = await issueToken(user);
    const authTokenService = Reflect.get(
      app.get(AuthService),
      'authTokenService',
    ) as AuthTokenService;
    const originalSign = authTokenService.signTokenPair.bind(authTokenService);
    let release!: () => void;
    let enteredResolve!: () => void;
    let paused = false;
    const entered = new Promise<void>((resolve) => {
      enteredResolve = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const signSpy = jest
      .spyOn(authTokenService, 'signTokenPair')
      .mockImplementation(async (userId, sessionId) => {
        if (userId === user.id && !paused) {
          paused = true;
          enteredResolve();
          await gate;
        }
        return originalSign.call(authTokenService, userId, sessionId);
      });
    let transactionBarrier:
      ReturnType<typeof barrierAfterRecoveryRead> | undefined;

    try {
      const refreshPromise = request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', session.refreshCookie)
        .then((response) => response);
      await entered;
      transactionBarrier = barrierAfterRecoveryRead(token);
      const resetPromise = request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token, newPassword: RESET_PASSWORD })
        .then((response) => response);
      await transactionBarrier.read;
      release();
      const resetResponse = await resetPromise;
      expect(resetResponse.status).toBe(204);
      const refreshResponse = await refreshPromise;
      expect([200, 401]).toContain(refreshResponse.status);
      if (refreshResponse.status === 200) {
        await request(app.getHttpServer())
          .get('/api/auth/me')
          .set(
            'Authorization',
            `Bearer ${(refreshResponse.body as AccessTokenResponse).data.accessToken}`,
          )
          .expect(401);
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', refreshCookie(refreshResponse))
          .expect(401);
      } else {
        expectClearedCookie(refreshResponse);
      }
    } finally {
      release();
      transactionBarrier?.restore();
      signSpy.mockRestore();
    }

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(401);
  });

  it('allows exactly one concurrent submission after both transactions read the unused token', async () => {
    const user = await createUser();
    const token = await issueToken(user);
    const originalTransaction = (
      PrismaClient.prototype as unknown as TransactionRunner
    ).$transaction.bind(prisma);
    let reads = 0;
    let release!: () => void;
    let bothReadResolve!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      bothReadResolve = resolve;
    });
    const releaseWrites = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transactionSpy = jest
      .spyOn(prisma, '$transaction')
      .mockImplementation((callback: unknown, options: unknown) => {
        const runCallback = callback as TransactionCallback;
        return originalTransaction(async (transaction) => {
          const wrappedTransaction = new Proxy(transaction, {
            get(target, property, receiver) {
              if (property !== 'passwordRecoveryToken') {
                return Reflect.get(target, property, receiver) as unknown;
              }

              const recoveryDelegate = Reflect.get(
                target,
                property,
                receiver,
              ) as object;
              return new Proxy(recoveryDelegate, {
                get(delegate, delegateProperty, delegateReceiver) {
                  if (delegateProperty !== 'findUnique') {
                    return Reflect.get(
                      delegate,
                      delegateProperty,
                      delegateReceiver,
                    ) as unknown;
                  }

                  const findUnique = Reflect.get(
                    delegate,
                    delegateProperty,
                    delegateReceiver,
                  ) as (args: unknown) => Promise<unknown>;
                  return async (args: unknown) => {
                    const result = await findUnique.call(delegate, args);
                    reads += 1;
                    if (reads === 2) bothReadResolve();
                    if (reads <= 2) await releaseWrites;
                    return result;
                  };
                },
              });
            },
          });

          return runCallback(wrappedTransaction);
        }, options);
      });

    try {
      const responsesPromise = Promise.all([
        request(app.getHttpServer())
          .post('/api/auth/reset-password')
          .send({ token, newPassword: RESET_PASSWORD }),
        request(app.getHttpServer())
          .post('/api/auth/reset-password')
          .send({ token, newPassword: 'another-password-123' }),
      ]);
      await bothRead;
      release();
      const responses = await responsesPromise;
      transactionSpy.mockRestore();
      expect(responses.map(({ status }) => status).sort()).toEqual([204, 401]);

      const winnerPassword =
        responses[0].status === 204 ? RESET_PASSWORD : 'another-password-123';
      const loserPassword =
        responses[0].status === 204 ? 'another-password-123' : RESET_PASSWORD;
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: winnerPassword })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: loserPassword })
        .expect(401);
    } finally {
      release();
      transactionSpy.mockRestore();
    }
  });

  it('rejects reset abuse with an exact 429 before consuming a real token', async () => {
    const user = await createUser();
    const session = await login(user.email);
    const token = await issueToken(user);
    const beforePassword = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    const beforeSessions = await prisma.session.count({
      where: { userId: user.id, revokedAt: null },
    });
    const previousLimit = process.env.AUTH_PASSWORD_RESET_IP_LIMIT;
    process.env.AUTH_PASSWORD_RESET_IP_LIMIT = '1';
    const throttledModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({ send: jest.fn() })
      .compile();
    const throttledApp: INestApplication<App> =
      throttledModule.createNestApplication();
    configureApp(throttledApp, throttledApp.get(ConfigService));
    await throttledApp.init();

    try {
      await request(throttledApp.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: 'u'.repeat(43), newPassword: RESET_PASSWORD })
        .expect(401);
      const response = await request(throttledApp.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token, newPassword: RESET_PASSWORD })
        .expect(429);
      expect(response.body).toEqual({
        error: {
          code: 'HTTP_ERROR',
          message: 'ThrottlerException: Too Many Requests',
        },
      });
    } finally {
      await throttledApp.close();
      if (previousLimit === undefined) {
        delete process.env.AUTH_PASSWORD_RESET_IP_LIMIT;
      } else {
        process.env.AUTH_PASSWORD_RESET_IP_LIMIT = previousLimit;
      }
    }

    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      }),
    ).resolves.toEqual(beforePassword);
    expect(
      await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(beforeSessions);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    await expect(
      prisma.passwordRecoveryToken.findUniqueOrThrow({
        where: { userId: user.id },
        select: { consumedAt: true },
      }),
    ).resolves.toEqual({ consumedAt: null });
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, newPassword: RESET_PASSWORD })
      .expect(204);
  });

  it('rejects an invalid input before changing recovery state or credentials', async () => {
    const user = await createUser();
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: `recovery-session-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    const sessionsBefore = await prisma.session.count({
      where: { userId: user.id },
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'invalid-email' })
      .expect(400);

    const errorBody = response.body as { error: { code: string } };
    expect(errorBody.error.code).toBe('VALIDATION_FAILED');
    expect(
      await prisma.passwordRecoveryToken.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
      sessionsBefore,
    );
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      }),
    ).resolves.toEqual(before);
  });

  afterEach(async () => {
    if (createdUserIds.length) {
      await prisma.passwordRecoveryToken.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.splice(0);
    }
    if (createdRoleIds.length) {
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      createdRoleIds.splice(0);
    }
  });

  afterAll(async () => {
    await app.close();
  });
});
