import { createHash, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { MailService } from './../src/mail/mail.service';
import { PrismaService } from './../src/prisma.service';

const GENERIC_MESSAGE =
  'Si existe una cuenta activa con ese correo, recibirás instrucciones para recuperar el acceso.';

interface SuccessResponse {
  data: { message: string };
}

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

  it('rejects invalid input before changing recovery state or credentials', async () => {
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
