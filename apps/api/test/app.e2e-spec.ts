import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import type { CurrentUser } from './../src/auth/auth.types';

interface LoginResponseBody {
  accessToken: string;
  currentUser: CurrentUser;
}

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let corsOrigin: string;
  let accessToken: string;
  let currentUser: CurrentUser;
  let loginResponseBody: LoginResponseBody;
  let refreshCookie: string | undefined;
  let cookieSecure: boolean;
  let refreshTtlSeconds: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

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
    loginResponseBody = responseBody as LoginResponseBody;
    accessToken = loginResponseBody.accessToken;
    currentUser = loginResponseBody.currentUser;

    const setCookieHeaders = loginResponse.headers['set-cookie'] as
      string[] | undefined;
    refreshCookie = setCookieHeaders?.find((cookie) =>
      cookie.startsWith('refresh_token='),
    );
  });

  it('GET /api/health returns a stable health response', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200).expect({
      status: 'ok',
    });
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

  it('rejects invalid credentials with a generic 401 and no refresh cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'member@example.com',
        password: 'invalid-seed-password',
      })
      .expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      message: 'Invalid credentials',
      error: 'Unauthorized',
    });
    expect(response.headers['set-cookie'] ?? []).toEqual([]);
  });

  it('rejects GET /api/auth/me without a bearer token', () => {
    return request(app.getHttpServer()).get('/api/auth/me').expect(401).expect({
      statusCode: 401,
      message: 'Authentication required',
      error: 'Unauthorized',
    });
  });

  it('returns the authenticated currentUser for a valid access token', () => {
    return request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({ currentUser });
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
      .expect({
        statusCode: 401,
        message: 'Authentication required',
        error: 'Unauthorized',
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
