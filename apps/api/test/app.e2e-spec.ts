import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import type { CurrentUser } from './../src/auth/auth.types';
import { PrismaService } from './../src/prisma.service';

interface LoginPayload {
  accessToken: string;
  currentUser: CurrentUser;
}

interface SuccessResponse<T> {
  data: T;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; code: string }>;
  };
}

interface TaskListResponseBody {
  data: Array<{ id: string; dueDate: string | null }>;
  meta: { page: number; limit: number; totalItems: number; totalPages: number };
}

interface LoginSession {
  accessToken: string;
  refreshCookie: string;
}

interface RegisteredSession extends LoginSession {
  email: string;
  userId: string;
}

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let corsOrigin: string;
  let accessToken: string;
  let currentUser: CurrentUser;
  let loginResponseBody: LoginPayload;
  let refreshCookie: string | undefined;
  let cookieSecure: boolean;
  let refreshTtlSeconds: number;
  let prisma: PrismaService;
  const createdTaskIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];

  function getRefreshCookie(response: Response): string {
    const setCookieHeaders = response.headers['set-cookie'] as
      string[] | undefined;
    const refreshCookieHeader = setCookieHeaders?.find((cookie) =>
      cookie.startsWith('refresh_token='),
    );

    expect(refreshCookieHeader).toEqual(expect.any(String));
    return refreshCookieHeader!;
  }

  async function loginSession(): Promise<LoginSession> {
    const configService = app.get(ConfigService);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'member@example.com',
        password: configService.getOrThrow<string>('SEED_MEMBER_PASSWORD'),
      })
      .expect(200);

    return {
      accessToken: (response.body as SuccessResponse<LoginPayload>).data
        .accessToken,
      refreshCookie: getRefreshCookie(response),
    };
  }

  async function loginUser(
    email: string,
    password: string,
  ): Promise<LoginSession> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return {
      accessToken: (response.body as SuccessResponse<LoginPayload>).data
        .accessToken,
      refreshCookie: getRefreshCookie(response),
    };
  }

  async function registerSession(
    email = `password-change-${randomUUID()}@example.com`,
    password = 'a'.repeat(12),
  ): Promise<RegisteredSession> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    const body = (response.body as SuccessResponse<LoginPayload>).data;
    createdUserIds.push(body.currentUser.id);

    return {
      email,
      userId: body.currentUser.id,
      accessToken: body.accessToken,
      refreshCookie: getRefreshCookie(response),
    };
  }

  function expectClearedRefreshCookie(response: Response): void {
    const setCookieHeaders = response.headers['set-cookie'] as
      string[] | undefined;
    const refreshCookieHeader = setCookieHeaders?.find((cookie) =>
      cookie.startsWith('refresh_token='),
    );

    expect(refreshCookieHeader).toEqual(expect.any(String));
    expect(refreshCookieHeader).toContain('Path=/api/auth');
    expect(refreshCookieHeader).toContain('HttpOnly');
    expect(refreshCookieHeader).toContain(
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );
  }

  function expectError(response: Response, code: string): void {
    const responseBody = getError(response);
    expect(responseBody.error.code).toBe(code);
    expect(responseBody.error.message.trim()).not.toBe('');
  }

  function getError(response: Response): ErrorResponse {
    return response.body as ErrorResponse;
  }

  beforeAll(async () => {
    process.env.AUTH_REGISTRATION_IP_LIMIT = '100';
    process.env.AUTH_REGISTRATION_IP_TTL_SECONDS = '60';
    process.env.AUTH_REGISTRATION_EMAIL_LIMIT = '3';
    process.env.AUTH_REGISTRATION_EMAIL_TTL_SECONDS = '60';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);

    const configService = app.get(ConfigService);
    configureApp(app, configService);

    corsOrigin = configService.get<string>(
      'CORS_ORIGIN',
      'http://localhost:5173',
    );
    cookieSecure =
      configService.getOrThrow<string>('AUTH_COOKIE_SECURE') === 'true';
    refreshTtlSeconds = Number(
      configService.getOrThrow<string>('JWT_REFRESH_TTL_SECONDS'),
    );

    await app.init();

    const memberPassword = configService.get<string>('SEED_MEMBER_PASSWORD');
    if (!memberPassword) {
      throw new Error(
        'SEED_MEMBER_PASSWORD must be configured for auth E2E tests',
      );
    }

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'member@example.com',
        password: memberPassword,
      })
      .expect(200);

    const responseBody: unknown = loginResponse.body;
    loginResponseBody = (responseBody as SuccessResponse<LoginPayload>).data;
    accessToken = loginResponseBody.accessToken;
    currentUser = loginResponseBody.currentUser;

    const setCookieHeaders = loginResponse.headers['set-cookie'] as
      string[] | undefined;
    refreshCookie = setCookieHeaders?.find((cookie) =>
      cookie.startsWith('refresh_token='),
    );
  });

  it('GET /api/health returns a stable health response', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ data: { status: 'ok' } });
  });

  it('returns 404 for an unknown route', () => {
    return request(app.getHttpServer()).get('/api/not-found').expect(404);
  });

  it('allows the configured CORS origin', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', corsOrigin)
      .expect(200)
      .expect('Access-Control-Allow-Origin', corsOrigin)
      .expect('Access-Control-Allow-Credentials', 'true');
  });

  it('logs in a seeded member and sets a secure refresh cookie', () => {
    expect(accessToken).toEqual(expect.any(String));
    expect(typeof currentUser.id).toBe('string');
    expect(currentUser).toEqual({
      id: currentUser.id,
      email: 'member@example.com',
      name: 'Member User',
      role: 'Member',
      permissions: [
        'tasks:create:own',
        'tasks:delete:own',
        'tasks:read:own',
        'tasks:update:own',
      ],
    });

    expect(loginResponseBody.currentUser).toEqual(currentUser);
    expect(refreshCookie).toEqual(expect.any(String));
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
    expect(refreshCookie).toContain('Path=/api/auth');
    expect(refreshCookie).toContain(`Max-Age=${refreshTtlSeconds}`);

    if (cookieSecure) {
      expect(refreshCookie).toContain('Secure');
    } else {
      expect(refreshCookie).not.toContain('Secure');
    }
  });

  it('asserts additive default-deny role classification for seeded roles', async () => {
    const memberRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'Member' },
      select: { isPrivileged: true },
    });
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'Admin' },
      select: { isPrivileged: true },
    });

    expect(memberRole.isPrivileged).toBe(false);
    expect(adminRole.isPrivileged).toBe(true);
  });

  it('defaults an unknown role to privileged and preserves seed classifications on upsert', async () => {
    const unknownRole = await prisma.role.create({
      data: { name: `Future role ${randomUUID()}` },
      select: { id: true, isPrivileged: true },
    });
    createdRoleIds.push(unknownRole.id);

    expect(unknownRole.isPrivileged).toBe(true);

    await prisma.role.upsert({
      where: { name: 'Member' },
      update: { isPrivileged: false },
      create: { name: 'Member', isPrivileged: false },
    });
    await prisma.role.upsert({
      where: { name: 'Admin' },
      update: { isPrivileged: true },
      create: { name: 'Admin', isPrivileged: true },
    });

    await expect(
      prisma.role.findMany({
        where: { name: { in: ['Member', 'Admin'] } },
        select: { name: true, isPrivileged: true },
        orderBy: { name: 'asc' },
      }),
    ).resolves.toEqual([
      { name: 'Admin', isPrivileged: true },
      { name: 'Member', isPrivileged: false },
    ]);
  });

  it.each([12, 128])(
    'registers a %s-character password and establishes the login session',
    async (length) => {
      const email = `registration-${randomUUID()}@example.com`;
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: 'a'.repeat(length) })
        .expect(201);
      const body = (response.body as SuccessResponse<LoginPayload>).data;
      createdUserIds.push(body.currentUser.id);

      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.currentUser).toEqual(
        expect.objectContaining({
          email,
          name: email,
          role: 'Member',
        }),
      );
      expect(getRefreshCookie(response)).toContain('Path=/api/auth');

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200)
        .expect({ data: { currentUser: body.currentUser } });
    },
  );

  it.each([
    { password: 'a'.repeat(11), description: '11 characters' },
    { password: 'a'.repeat(129), description: '129 characters' },
    { password: 123456789012, description: 'a non-string value' },
  ])(
    'rejects $description without creating an account',
    async ({ password }) => {
      const email = `invalid-registration-${randomUUID()}@example.com`;
      const countBefore = await prisma.user.count({ where: { email } });

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password })
        .expect(400);

      expectError(response, 'VALIDATION_FAILED');
      expect(await prisma.user.count({ where: { email } })).toBe(countBefore);
    },
  );

  it('normalizes duplicate email input and returns 409 without a second account', async () => {
    const email = `duplicate-${randomUUID()}@example.com`;
    const firstResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: ` ${email.toUpperCase()} `, password: 'a'.repeat(12) })
      .expect(201);
    const firstUser = (firstResponse.body as SuccessResponse<LoginPayload>).data
      .currentUser;
    createdUserIds.push(firstUser.id);

    const duplicateResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email.toLowerCase(), password: 'b'.repeat(12) })
      .expect(409);

    expectError(duplicateResponse, 'CONFLICT');
    expect(
      await prisma.user.count({ where: { email: email.toLowerCase() } }),
    ).toBe(1);
  });

  it('throttles repeated registration attempts by normalized email', async () => {
    const email = `throttled-${randomUUID()}@example.com`;
    const firstResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'a'.repeat(12) })
      .expect(201);
    createdUserIds.push(
      (firstResponse.body as SuccessResponse<LoginPayload>).data.currentUser.id,
    );

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password: 'b'.repeat(12) })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'c'.repeat(12) })
      .expect(409);

    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'd'.repeat(12) })
      .expect(429);

    expect(response.headers['retry-after-registration-email']).toEqual(
      expect.any(String),
    );
  });

  it('uses the same refresh-cookie contract as login', async () => {
    const email = `cookie-${randomUUID()}@example.com`;
    const registrationResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'a'.repeat(12) })
      .expect(201);
    const registeredUser = (
      registrationResponse.body as SuccessResponse<LoginPayload>
    ).data.currentUser;
    createdUserIds.push(registeredUser.id);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'a'.repeat(12) })
      .expect(200);

    const registrationCookie = getRefreshCookie(registrationResponse);
    const loginCookie = getRefreshCookie(loginResponse);
    expect(registrationCookie.split('; ').slice(1)).toEqual(
      loginCookie.split('; ').slice(1),
    );
  });

  it('rejects invalid credentials with a generic 401 and no refresh cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'member@example.com',
        password: 'invalid-seed-password',
      })
      .expect(401);

    expectError(response, 'UNAUTHORIZED');
    expect(getError(response).error).not.toHaveProperty('details');
    expect(response.headers['set-cookie'] ?? []).toEqual([]);
  });

  it('reports validation failures with field-level details', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'invalid-email', password: '' })
      .expect(400);

    expectError(response, 'VALIDATION_FAILED');
    expect(getError(response).error.details).toEqual(
      expect.arrayContaining([
        { field: 'email', code: 'INVALID_EMAIL' },
        { field: 'password', code: 'REQUIRED' },
      ]),
    );
  });

  it('rejects GET /api/auth/me without a bearer token', () => {
    return request(app.getHttpServer())
      .get('/api/auth/me')
      .expect(401)
      .then((response) => expectError(response, 'UNAUTHORIZED'));
  });

  it('returns the authenticated currentUser for a valid access token', () => {
    return request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({ data: { currentUser } });
  });

  it('rejects a tampered bearer token with a generic 401', () => {
    const lastCharacter = accessToken.at(-1);
    const tamperedToken = `${accessToken.slice(0, -1)}${
      lastCharacter === 'a' ? 'b' : 'a'
    }`;

    return request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .expect(401)
      .then((response) => expectError(response, 'UNAUTHORIZED'));
  });

  it('rotates a valid refresh token and returns only a new access token', async () => {
    const session = await loginSession();
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(200);

    const responseBody = response.body as SuccessResponse<{
      accessToken: unknown;
      currentUser?: unknown;
    }>;
    expect(typeof responseBody.data.accessToken).toBe('string');
    expect(responseBody.data.currentUser).toBeUndefined();

    const replacementCookie = getRefreshCookie(response);
    expect(replacementCookie).toContain('Path=/api/auth');
    expect(replacementCookie).toContain('HttpOnly');
    expect(replacementCookie).toContain('SameSite=Strict');
    expect(replacementCookie).toContain(`Max-Age=${refreshTtlSeconds}`);
  });

  it('rejects reuse of the old refresh token and revokes the whole session', async () => {
    const session = await loginSession();
    const rotationResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(200);
    const replacementCookie = getRefreshCookie(rotationResponse);

    const reuseResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(401);

    expectError(reuseResponse, 'UNAUTHORIZED');
    expect(getError(reuseResponse).error).not.toHaveProperty('details');
    expectClearedRefreshCookie(reuseResponse);

    const currentTokenResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', replacementCookie)
      .expect(401);

    expectError(currentTokenResponse, 'UNAUTHORIZED');
    expectClearedRefreshCookie(currentTokenResponse);
  });

  it('allows only one concurrent refresh to rotate the same token', async () => {
    const session = await loginSession();
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', session.refreshCookie),
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', session.refreshCookie),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
  });

  it('logs out without an access token, revokes the session, and clears the cookie', async () => {
    const session = await loginSession();
    const logoutResponse = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', session.refreshCookie)
      .expect(204);

    expect(logoutResponse.text).toBe('');
    expectClearedRefreshCookie(logoutResponse);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(401);
  });

  it('makes repeated logout idempotent and clears an absent or malformed cookie', async () => {
    const session = await loginSession();
    const firstLogout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', session.refreshCookie)
      .expect(204);
    expectClearedRefreshCookie(firstLogout);

    const repeatedLogout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', session.refreshCookie)
      .expect(204);
    expectClearedRefreshCookie(repeatedLogout);

    const absentCookieResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .expect(401);
    expectError(absentCookieResponse, 'UNAUTHORIZED');
    expectClearedRefreshCookie(absentCookieResponse);

    const malformedCookieResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=malformed-token')
      .expect(401);
    expectError(malformedCookieResponse, 'UNAUTHORIZED');
    expectClearedRefreshCookie(malformedCookieResponse);
  });

  it('rejects a wrong current password without mutating the password or sessions', async () => {
    const password = 'a'.repeat(12);
    const session = await registerSession(undefined, password);
    const otherSession = await loginUser(session.email, password);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { passwordHash: true },
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: 'wrong-password', newPassword: 'b'.repeat(12) })
      .expect(401);

    expectError(response, 'UNAUTHORIZED');
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: { passwordHash: true },
      }),
    ).resolves.toEqual(before);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', otherSession.refreshCookie)
      .expect(200);
  });

  it.each([11, 129])(
    'rejects a %s-character replacement before mutation or revocation',
    async (length) => {
      const password = 'a'.repeat(12);
      const session = await registerSession(undefined, password);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: { email: true },
      });
      const otherSession = await loginUser(user.email, password);

      const response = await request(app.getHttpServer())
        .post('/api/auth/password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ currentPassword: password, newPassword: 'b'.repeat(length) })
        .expect(400);

      expectError(response, 'VALIDATION_FAILED');
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', otherSession.refreshCookie)
        .expect(200);
    },
  );

  it('preserves the caller and invalidates every other session after a password change', async () => {
    const password = 'a'.repeat(12);
    const session = await registerSession(undefined, password);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { email: true },
    });
    const otherSessions = await Promise.all([
      loginUser(user.email, password),
      loginUser(user.email, password),
    ]);

    const response = await request(app.getHttpServer())
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: password, newPassword: 'b'.repeat(12) })
      .expect(204);

    expect(response.text).toBe('');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/tasks')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    for (const otherSession of otherSessions) {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${otherSession.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', otherSession.refreshCookie)
        .expect(401);
    }
  });

  it('does not leave a concurrently refreshed other session active after success', async () => {
    const password = 'a'.repeat(12);
    const session = await registerSession(undefined, password);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { email: true },
    });
    const otherSession = await loginUser(user.email, password);

    const [changeResponse, refreshResponse] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ currentPassword: password, newPassword: 'b'.repeat(12) }),
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', otherSession.refreshCookie),
    ]);

    expect(changeResponse.status).toBe(204);
    expect([200, 401]).toContain(refreshResponse.status);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    if (refreshResponse.status === 200) {
      const refreshed = refreshResponse.body as SuccessResponse<{
        accessToken: string;
      }>;
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${refreshed.data.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', getRefreshCookie(refreshResponse))
        .expect(401);
    }

    const activeSessions = await prisma.session.count({
      where: { userId: session.userId, revokedAt: null },
    });
    expect(activeSessions).toBe(1);
  });

  it('lists only owned tasks with defaults and collection metadata', async () => {
    const isolationKey = randomUUID();
    const otherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });
    const ownTask = await prisma.task.create({
      data: { ownerId: currentUser.id, title: `Member task ${isolationKey}` },
    });
    const foreignTask = await prisma.task.create({
      data: { ownerId: otherUser.id, title: `Admin task ${isolationKey}` },
    });
    createdTaskIds.push(ownTask.id, foreignTask.id);

    const response = await request(app.getHttpServer())
      .get('/api/tasks')
      .query({ search: isolationKey })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const responseBody = response.body as TaskListResponseBody;

    expect(responseBody.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ownTask.id })]),
    );
    expect(responseBody.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: foreignTask.id })]),
    );
    expect(responseBody.meta).toEqual({
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it('reads an owned task by identifier', async () => {
    const task = await prisma.task.create({
      data: {
        ownerId: currentUser.id,
        title: 'Readable owned task',
        description: 'Single-resource read coverage',
      },
    });
    createdTaskIds.push(task.id);

    const response = await request(app.getHttpServer())
      .get(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const responseBody = response.body as SuccessResponse<{
      id: string;
      ownerId: string;
      title: string;
      description: string | null;
    }>;

    expect(responseBody.data).toMatchObject({
      id: task.id,
      ownerId: currentUser.id,
      title: 'Readable owned task',
      description: 'Single-resource read coverage',
    });
  });

  it('creates a self-owned task with trimmed fields, a default status, and a past date', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: '  Created task  ',
        description: 'Created through the API',
        dueDate: '2020-01-02',
      })
      .expect(201);

    const task = (
      response.body as SuccessResponse<{
        id: string;
        ownerId: string;
        title: string;
        description: string;
        status: string;
        dueDate: string;
      }>
    ).data;
    createdTaskIds.push(task.id);

    expect(task).toMatchObject({
      ownerId: currentUser.id,
      title: 'Created task',
      description: 'Created through the API',
      status: 'pending',
      dueDate: '2020-01-02',
    });
  });

  it('updates an owned task, clears its due date, and preserves its owner', async () => {
    const task = await prisma.task.create({
      data: {
        ownerId: currentUser.id,
        title: 'Editable task',
        dueDate: new Date('2024-02-29T00:00:00.000Z'),
      },
    });
    createdTaskIds.push(task.id);

    const response = await request(app.getHttpServer())
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: '  Updated task  ', status: 'completed', dueDate: null })
      .expect(200);
    const updatedTask = (
      response.body as SuccessResponse<{
        id: string;
        ownerId: string;
        title: string;
        status: string;
        dueDate: string | null;
      }>
    ).data;

    expect(updatedTask).toMatchObject({
      id: task.id,
      ownerId: currentUser.id,
      title: 'Updated task',
      status: 'completed',
      dueDate: null,
    });
  });

  it('permanently deletes an owned task exactly once', async () => {
    const task = await prisma.task.create({
      data: { ownerId: currentUser.id, title: 'Disposable task' },
    });
    createdTaskIds.push(task.id);

    const response = await request(app.getHttpServer())
      .delete(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    expect(response.text).toBe('');
    await expect(
      prisma.task.findUnique({ where: { id: task.id } }),
    ).resolves.toBeNull();

    const duplicateResponse = await request(app.getHttpServer())
      .delete(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expectError(duplicateResponse, 'NOT_FOUND');
  });

  it('rejects invalid patch fields and ownership transfer attempts', async () => {
    const otherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });
    const task = await prisma.task.create({
      data: { ownerId: currentUser.id, title: 'Protected task' },
    });
    createdTaskIds.push(task.id);

    const invalidResponse = await request(app.getHttpServer())
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: ' ', dueDate: '2024-02-30' })
      .expect(400);
    expectError(invalidResponse, 'VALIDATION_FAILED');
    expect(getError(invalidResponse).error.details).toEqual(
      expect.arrayContaining([
        { field: 'title', code: 'TOO_SHORT' },
        { field: 'dueDate', code: 'INVALID_DATE' },
      ]),
    );

    const ownerResponse = await request(app.getHttpServer())
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ownerId: otherUser.id })
      .expect(400);
    expectError(ownerResponse, 'VALIDATION_FAILED');

    const unchangedTask = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(unchangedTask.ownerId).toBe(currentUser.id);
  });

  it('rejects invalid fields and an explicit foreign owner for an own-scoped creator', async () => {
    const otherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });

    const invalidResponse = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: ' ', dueDate: '2024-02-30' })
      .expect(400);
    expectError(invalidResponse, 'VALIDATION_FAILED');
    expect(getError(invalidResponse).error.details).toEqual(
      expect.arrayContaining([
        { field: 'title', code: 'TOO_SHORT' },
        { field: 'dueDate', code: 'INVALID_DATE' },
      ]),
    );

    const foreignOwnerResponse = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Foreign task', ownerId: otherUser.id })
      .expect(403);
    expectError(foreignOwnerResponse, 'FORBIDDEN');
  });

  it('returns 404 for foreign and missing task identifiers', async () => {
    const otherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });
    const foreignTask = await prisma.task.create({
      data: { ownerId: otherUser.id, title: 'Private task' },
    });
    createdTaskIds.push(foreignTask.id);

    for (const id of [foreignTask.id, '00000000-0000-0000-0000-000000000000']) {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expectError(response, 'NOT_FOUND');

      const updateResponse = await request(app.getHttpServer())
        .patch(`/api/tasks/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Should not update' })
        .expect(404);
      expectError(updateResponse, 'NOT_FOUND');
    }
  });

  it('returns 404 when deleting a foreign or missing task', async () => {
    const otherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });
    const foreignTask = await prisma.task.create({
      data: { ownerId: otherUser.id, title: 'Private disposable task' },
    });
    createdTaskIds.push(foreignTask.id);

    for (const id of [foreignTask.id, '00000000-0000-0000-0000-000000000000']) {
      const response = await request(app.getHttpServer())
        .delete(`/api/tasks/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expectError(response, 'NOT_FOUND');
    }

    await expect(
      prisma.task.findUnique({ where: { id: foreignTask.id } }),
    ).resolves.toEqual(expect.objectContaining({ id: foreignTask.id }));
  });

  it('rejects a foreign owner filter and undeclared query parameters', async () => {
    const otherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });

    const foreignOwnerResponse = await request(app.getHttpServer())
      .get(`/api/tasks?ownerId=${otherUser.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    expectError(foreignOwnerResponse, 'FORBIDDEN');

    const invalidQueryResponse = await request(app.getHttpServer())
      .get('/api/tasks?unexpected=value')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
    expectError(invalidQueryResponse, 'VALIDATION_FAILED');
  });

  it('applies literal search, date filters, sorting, pagination, and bounds', async () => {
    const matchingTask = await prisma.task.create({
      data: {
        ownerId: currentUser.id,
        title: '100% report',
        description: 'Quarterly status',
        status: 'completed',
        dueDate: new Date('2024-02-29T00:00:00.000Z'),
      },
    });
    const nonMatchingTask = await prisma.task.create({
      data: { ownerId: currentUser.id, title: '100 percent report' },
    });
    createdTaskIds.push(matchingTask.id, nonMatchingTask.id);

    const response = await request(app.getHttpServer())
      .get(
        '/api/tasks?search=%25&status=completed&dueDate=2024-02-29&sort=title&page=1&limit=1',
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const responseBody = response.body as TaskListResponseBody;

    expect(responseBody.data).toEqual([
      expect.objectContaining({ id: matchingTask.id, dueDate: '2024-02-29' }),
    ]);
    expect(responseBody.meta).toEqual({
      page: 1,
      limit: 1,
      totalItems: 1,
      totalPages: 1,
    });

    const invalidDateResponse = await request(app.getHttpServer())
      .get('/api/tasks?dueDate=2024-02-30')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
    expectError(invalidDateResponse, 'VALIDATION_FAILED');

    const invalidLimitResponse = await request(app.getHttpServer())
      .get('/api/tasks?limit=101')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
    expectError(invalidLimitResponse, 'VALIDATION_FAILED');
  });

  it('searches title and description case-insensitively and reports filtered no-results', async () => {
    const isolationKey = randomUUID();
    const matchingTask = await prisma.task.create({
      data: {
        ownerId: currentUser.id,
        title: `Unrelated title ${isolationKey}`,
        description: `Description Marker ${isolationKey}%`,
      },
    });
    const nonMatchingTask = await prisma.task.create({
      data: {
        ownerId: currentUser.id,
        title: `Another title ${isolationKey}`,
        description: 'Different description',
      },
    });
    createdTaskIds.push(matchingTask.id, nonMatchingTask.id);

    const matchingResponse = await request(app.getHttpServer())
      .get(`/api/tasks?search=description%20marker%20${isolationKey}%25`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const matchingBody = matchingResponse.body as TaskListResponseBody;
    expect(matchingBody.data).toEqual([
      expect.objectContaining({ id: matchingTask.id }),
    ]);
    expect(matchingBody.meta).toEqual({
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    });

    const noResultsResponse = await request(app.getHttpServer())
      .get(`/api/tasks?search=missing-${isolationKey}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const noResultsBody = noResultsResponse.body as TaskListResponseBody;
    expect(noResultsBody.data).toEqual([]);
    expect(noResultsBody.meta).toEqual({
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 0,
    });
  });

  it.each([
    ['page=0', 'page below minimum'],
    ['limit=0', 'limit below minimum'],
    ['sort=priority', 'undeclared sort field'],
  ])('rejects invalid rich-query parameters: %s (%s)', async (query) => {
    const response = await request(app.getHttpServer())
      .get(`/api/tasks?${query}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    expectError(response, 'VALIDATION_FAILED');
  });

  afterEach(async () => {
    if (createdUserIds.length) {
      const userIds = createdUserIds.splice(0);
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    if (createdTaskIds.length) {
      await prisma.task.deleteMany({
        where: { id: { in: createdTaskIds.splice(0) } },
      });
    }

    if (createdRoleIds.length) {
      await prisma.role.deleteMany({
        where: { id: { in: createdRoleIds.splice(0) } },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });
});
