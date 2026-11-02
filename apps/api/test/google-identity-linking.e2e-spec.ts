import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { GoogleTokenVerifier } from './../src/auth/google-token-verifier';
import type { CurrentUser } from './../src/auth/auth.types';
import { PrismaService } from './../src/prisma.service';
import { Prisma } from './../src/generated/prisma/client';

const GOOGLE_CLIENT_ID = 'google-client-id.apps.googleusercontent.com';
const PASSWORD = 'test-password-123';

type SuccessResponse<T> = { data: T };
type ErrorResponse = { error: { code: string; message: string } };

type Session = {
  email: string;
  userId: string;
  accessToken: string;
  refreshCookie: string;
};

type Challenge = {
  challengeId: string;
  nonce: string;
  expiresAt: string;
};

type GoogleCredential = {
  sub: string;
  email: string;
  emailVerified: boolean;
  nonce: string;
};

type TransactionCallback = (
  transaction: Prisma.TransactionClient,
) => Promise<unknown>;
type TransactionRunner = {
  $transaction: (
    callback: TransactionCallback,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) => Promise<unknown>;
};

describe('Google identity linking (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let verifier: { verify: jest.Mock<Promise<GoogleCredential>, [string]> };
  const createdUserIds: string[] = [];

  function refreshCookie(response: Response): string {
    const cookies = response.headers['set-cookie'] as string[] | undefined;
    const cookie = cookies?.find((value) => value.startsWith('refresh_token='));
    expect(cookie).toEqual(expect.any(String));
    return cookie!;
  }

  function errorBody(response: Response): ErrorResponse {
    return response.body as ErrorResponse;
  }

  async function createSession(
    email = `${randomUUID()}@example.com`,
  ): Promise<Session> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    const body = (
      response.body as SuccessResponse<{
        accessToken: string;
        currentUser: CurrentUser;
      }>
    ).data;
    createdUserIds.push(body.currentUser.id);
    return {
      email,
      userId: body.currentUser.id,
      accessToken: body.accessToken,
      refreshCookie: refreshCookie(response),
    };
  }

  async function loginSession(session: Session): Promise<Session> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: session.email, password: PASSWORD })
      .expect(200);
    const body = (
      response.body as SuccessResponse<{
        accessToken: string;
        currentUser: CurrentUser;
      }>
    ).data;
    expect(body.currentUser.id).toBe(session.userId);
    return {
      ...session,
      accessToken: body.accessToken,
      refreshCookie: refreshCookie(response),
    };
  }

  async function createChallenge(session: Session): Promise<Challenge> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/google/link/challenge')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(201);
    return (response.body as SuccessResponse<Challenge>).data;
  }

  async function getStatus(session: Session): Promise<{
    provider: 'google';
    enabled: boolean;
    clientId: string | null;
    linked: boolean;
  }> {
    const response = await request(app.getHttpServer())
      .get('/api/auth/google/status')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    return (
      response.body as SuccessResponse<{
        provider: 'google';
        enabled: boolean;
        clientId: string | null;
        linked: boolean;
      }>
    ).data;
  }

  async function runWithTransactionReadBarrier<T>(
    expectedReads: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const runner = prisma as unknown as TransactionRunner;
    const originalTransaction = runner.$transaction;
    const invokeTransaction = originalTransaction.bind(prisma);
    let reads = 0;
    let release!: () => void;
    let rejectBarrier!: (error: Error) => void;
    let timeout!: NodeJS.Timeout;
    const readBarrier = new Promise<void>((resolve, reject) => {
      release = resolve;
      rejectBarrier = reject;
      timeout = setTimeout(
        () => reject(new Error('Timed out waiting for transaction reads')),
        5_000,
      );
    });

    runner.$transaction = async (callback, options) =>
      invokeTransaction(async (transaction) => {
        const challengeDelegate = transaction.googleLinkChallenge;
        const originalFindFirst =
          challengeDelegate.findFirst.bind(challengeDelegate);
        const gatedDelegate = {
          findFirst: async (
            ...args: Parameters<typeof challengeDelegate.findFirst>
          ) => {
            const result = await originalFindFirst(...args);
            reads += 1;
            if (reads === expectedReads) {
              release();
            }
            await readBarrier;
            return result;
          },
          updateMany: challengeDelegate.updateMany.bind(challengeDelegate),
        } as unknown as typeof challengeDelegate;

        const gatedTransaction = Object.create(
          transaction,
        ) as Prisma.TransactionClient;
        Object.defineProperty(gatedTransaction, 'googleLinkChallenge', {
          value: gatedDelegate,
        });
        return callback(gatedTransaction);
      }, options);

    try {
      return await operation();
    } finally {
      clearTimeout(timeout);
      if (reads < expectedReads) {
        rejectBarrier(new Error('Transaction read barrier was not reached'));
      }
      runner.$transaction = originalTransaction;
    }
  }

  async function waitForVerifierCall(): Promise<void> {
    if (verifier.verify.mock.calls.length > 0) {
      return;
    }

    const started = Date.now();
    while (verifier.verify.mock.calls.length === 0) {
      if (Date.now() - started > 5_000) {
        throw new Error('Timed out waiting for Google verifier');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  function credentialFor(
    session: Session,
    challenge: Challenge,
    sub = randomUUID(),
  ) {
    return {
      sub,
      email: session.email,
      emailVerified: true,
      nonce: challenge.nonce,
    } satisfies GoogleCredential;
  }

  async function link(
    session: Session,
    challenge: Challenge,
    credential: GoogleCredential,
  ): Promise<Response> {
    verifier.verify.mockResolvedValueOnce(credential);
    return request(app.getHttpServer())
      .post('/api/auth/google/link')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        challengeId: challenge.challengeId,
        credential: 'mock-google-id-token',
      });
  }

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'google-test-access-secret-32-characters';
    process.env.JWT_REFRESH_SECRET = 'google-test-refresh-secret-32-characters';
    process.env.JWT_ACCESS_TTL_SECONDS = '900';
    process.env.JWT_REFRESH_TTL_SECONDS = '604800';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_REGISTRATION_DEFAULT_ROLE = 'Member';
    process.env.AUTH_REGISTRATION_IP_LIMIT = '1000';
    process.env.AUTH_REGISTRATION_IP_TTL_SECONDS = '900';
    process.env.AUTH_REGISTRATION_EMAIL_LIMIT = '100';
    process.env.AUTH_REGISTRATION_EMAIL_TTL_SECONDS = '900';
    process.env.AUTH_LOGIN_IP_LIMIT = '1000';
    process.env.AUTH_LOGIN_IP_TTL_SECONDS = '900';
    process.env.AUTH_LOGIN_EMAIL_LIMIT = '1000';
    process.env.AUTH_LOGIN_EMAIL_TTL_SECONDS = '900';
    process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;

    verifier = {
      verify: jest.fn<Promise<GoogleCredential>, [string]>(),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleTokenVerifier)
      .useValue(verifier)
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await prisma.role.upsert({
      where: { name: 'Member' },
      update: { isPrivileged: false },
      create: { name: 'Member', isPrivileged: false },
    });
    configureApp(app, app.get(ConfigService));
    await app.init();
  });

  beforeEach(() => {
    verifier.verify.mockReset();
  });

  it('requires authentication for status and challenge endpoints', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/google/status')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/google/link/challenge')
      .expect(401);
  });

  it('returns only safe enabled and unlinked provider status', async () => {
    const session = await createSession();
    const status = await getStatus(session);

    expect(status).toEqual({
      provider: 'google',
      enabled: true,
      clientId: GOOGLE_CLIENT_ID,
      linked: false,
    });
    expect(JSON.stringify(status)).not.toContain('sub');
    expect(JSON.stringify(status)).not.toContain('nonce');
    expect(JSON.stringify(status)).not.toContain('token');
    expect(JSON.stringify(status)).not.toContain('hash');
  });

  it('starts and fails closed over HTTP when the public Google client ID is missing', async () => {
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    let disabledApp: INestApplication<App> | undefined;

    try {
      const disabledVerifier = {
        verify: jest.fn<Promise<GoogleCredential>, [string]>(),
      };
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(GoogleTokenVerifier)
        .useValue(disabledVerifier)
        .compile();

      disabledApp = moduleFixture.createNestApplication();
      configureApp(disabledApp, disabledApp.get(ConfigService));
      await disabledApp.init();
      disabledApp.get(ConfigService).set('GOOGLE_CLIENT_ID', '');

      const email = `${randomUUID()}@example.com`;
      const registration = await request(disabledApp.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: PASSWORD })
        .expect(201);
      const session = (
        registration.body as SuccessResponse<{
          accessToken: string;
          currentUser: CurrentUser;
        }>
      ).data;
      createdUserIds.push(session.currentUser.id);

      const status = await request(disabledApp.getHttpServer())
        .get('/api/auth/google/status')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);
      expect(status.body).toEqual({
        data: {
          provider: 'google',
          enabled: false,
          clientId: null,
          linked: false,
        },
      });

      const challenge = await request(disabledApp.getHttpServer())
        .post('/api/auth/google/link/challenge')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(503);
      expect(errorBody(challenge).error.message).toBe(
        'Google linking is not configured',
      );

      const linkResponse = await request(disabledApp.getHttpServer())
        .post('/api/auth/google/link')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          challengeId: randomUUID(),
          credential: 'mock-google-id-token',
        })
        .expect(503);
      expect(errorBody(linkResponse).error.message).toBe(
        'Google linking is not configured',
      );

      await request(disabledApp.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      await request(disabledApp.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);
    } finally {
      await disabledApp?.close();
      if (previousClientId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = previousClientId;
      }
    }
  });

  it('creates a session-bound challenge and atomically links a verified matching identity', async () => {
    const session = await createSession();
    const challenge = await createChallenge(session);
    expect(challenge).toEqual({
      challengeId: expect.any(String) as string,
      nonce: expect.any(String) as string,
      expiresAt: expect.any(String) as string,
    });

    const response = await link(
      session,
      challenge,
      credentialFor(session, challenge),
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { provider: 'google', linked: true },
    });
    expect(JSON.stringify(response.body)).not.toContain(session.email);

    await expect(getStatus(session)).resolves.toEqual({
      provider: 'google',
      enabled: true,
      clientId: GOOGLE_CLIENT_ID,
      linked: true,
    });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: session.email, password: PASSWORD })
      .expect(200);
  });

  it('rejects malformed link input before any identity mutation', async () => {
    const session = await createSession();
    const before = await getStatus(session);
    const response = await request(app.getHttpServer())
      .post('/api/auth/google/link')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ challengeId: 'not-a-uuid', credential: '' })
      .expect(400);

    expect(errorBody(response).error.code).toBe('VALIDATION_FAILED');
    await expect(getStatus(session)).resolves.toEqual(before);
  });

  const verifierFailures: Array<{ description: string; error: Error }> = [
    {
      description: 'signature or audience validation failure',
      error: new Error('bad signature'),
    },
    {
      description: 'issuer validation failure',
      error: new Error('bad issuer'),
    },
    { description: 'expiry validation failure', error: new Error('expired') },
  ];

  it.each(verifierFailures)(
    'rejects $description without changing public state',
    async ({ error }) => {
      const session = await createSession();
      const challenge = await createChallenge(session);
      const before = await getStatus(session);
      verifier.verify.mockRejectedValueOnce(error);

      const response = await request(app.getHttpServer())
        .post('/api/auth/google/link')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          challengeId: challenge.challengeId,
          credential: 'mock-google-id-token',
        })
        .expect(401);

      expect(errorBody(response).error.code).toBe('UNAUTHORIZED');
      await expect(getStatus(session)).resolves.toEqual(before);
    },
  );

  const invalidClaims: Array<{
    description: string;
    patch: Partial<GoogleCredential>;
  }> = [
    { description: 'an empty subject', patch: { sub: '' } },
    { description: 'an unverified email', patch: { emailVerified: false } },
    {
      description: 'a nonce from another challenge',
      patch: { nonce: 'wrong-nonce' },
    },
  ];

  it.each(invalidClaims)(
    'rejects $description without consuming the challenge',
    async ({ patch }) => {
      const session = await createSession();
      const challenge = await createChallenge(session);
      const credential = { ...credentialFor(session, challenge), ...patch };
      const response = await link(session, challenge, credential);

      expect(response.status).toBe(401);
      await expect(
        link(session, challenge, credentialFor(session, challenge)),
      ).resolves.toMatchObject({
        status: 200,
      });
    },
  );

  it('rejects a verified Google email that does not match the normalized local email', async () => {
    const session = await createSession('Match-Email@example.com');
    const challenge = await createChallenge(session);
    const before = await getStatus(session);
    const response = await link(session, challenge, {
      ...credentialFor(session, challenge),
      email: 'different@example.com',
    });

    expect(response.status).toBe(401);
    await expect(getStatus(session)).resolves.toEqual(before);
  });

  it('rejects replay and expired challenges', async () => {
    const session = await createSession();
    const challenge = await createChallenge(session);
    const credential = credentialFor(session, challenge);
    await expect(link(session, challenge, credential)).resolves.toMatchObject({
      status: 200,
    });
    await expect(
      link(session, challenge, credentialFor(session, challenge)),
    ).resolves.toMatchObject({
      status: 401,
    });

    const expiredSession = await createSession();
    const expiredChallenge = await createChallenge(expiredSession);
    await prisma.googleLinkChallenge.update({
      where: { id: expiredChallenge.challengeId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(
      link(
        expiredSession,
        expiredChallenge,
        credentialFor(expiredSession, expiredChallenge),
      ),
    ).resolves.toMatchObject({ status: 401 });
  });

  it('rejects session mismatch and revoked or inactive sessions', async () => {
    const first = await createSession();
    const second = await createSession();
    const challenge = await createChallenge(first);
    const before = await getStatus(first);
    const mismatch = await link(
      second,
      challenge,
      credentialFor(first, challenge),
    );
    expect(mismatch.status).toBe(401);
    await expect(getStatus(first)).resolves.toEqual(before);

    const sameUserSecondSession = await loginSession(first);
    const sameSessionMismatch = await link(
      sameUserSecondSession,
      challenge,
      credentialFor(first, challenge),
    );
    expect(sameSessionMismatch.status).toBe(401);
    await expect(getStatus(first)).resolves.toEqual(before);

    await prisma.session.updateMany({
      where: { userId: first.userId },
      data: { revokedAt: new Date() },
    });
    await request(app.getHttpServer())
      .get('/api/auth/google/status')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(401);

    const inactive = await createSession();
    await prisma.user.update({
      where: { id: inactive.userId },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get('/api/auth/google/status')
      .set('Authorization', `Bearer ${inactive.accessToken}`)
      .expect(401);
  });

  it.each([
    {
      description: 'the current session is revoked',
      state: 'revoked' as const,
    },
    { description: 'the user is deactivated', state: 'inactive' as const },
  ])(
    'rechecks active state after the initial guard and challenge read when $description',
    async ({ state }) => {
      const session = await createSession();
      const challenge = await createChallenge(session);
      let releaseVerifier!: () => void;
      const verifierPaused = new Promise<void>((resolve) => {
        releaseVerifier = resolve;
      });
      verifier.verify.mockImplementation(async () => {
        await verifierPaused;
        return credentialFor(session, challenge);
      });

      const linkPromise = request(app.getHttpServer())
        .post('/api/auth/google/link')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          challengeId: challenge.challengeId,
          credential: 'mock-google-id-token',
        })
        .then((response) => response);
      await waitForVerifierCall();

      if (state === 'revoked') {
        await prisma.session.updateMany({
          where: { userId: session.userId },
          data: { revokedAt: new Date() },
        });
      } else {
        await prisma.user.update({
          where: { id: session.userId },
          data: { isActive: false },
        });
      }
      releaseVerifier();

      const response = await linkPromise;
      expect(response.status).toBe(401);

      if (state === 'revoked') {
        await prisma.session.updateMany({
          where: { userId: session.userId },
          data: { revokedAt: null },
        });
      } else {
        await prisma.user.update({
          where: { id: session.userId },
          data: { isActive: true },
        });
      }
      await expect(getStatus(session)).resolves.toEqual({
        provider: 'google',
        enabled: true,
        clientId: GOOGLE_CLIENT_ID,
        linked: false,
      });
    },
    15_000,
  );

  it('rejects duplicate and cross-user ownership without changing the original owner', async () => {
    const owner = await createSession();
    const ownerChallenge = await createChallenge(owner);
    const sub = randomUUID();
    await expect(
      link(owner, ownerChallenge, credentialFor(owner, ownerChallenge, sub)),
    ).resolves.toMatchObject({
      status: 200,
    });

    const other = await createSession();
    const otherChallenge = await createChallenge(other);
    const duplicate = await link(
      other,
      otherChallenge,
      credentialFor(other, otherChallenge, sub),
    );
    expect(duplicate.status).toBe(409);
    await expect(getStatus(owner)).resolves.toEqual({
      provider: 'google',
      enabled: true,
      clientId: GOOGLE_CLIENT_ID,
      linked: true,
    });
    await expect(getStatus(other)).resolves.toEqual({
      provider: 'google',
      enabled: true,
      clientId: GOOGLE_CLIENT_ID,
      linked: false,
    });

    await expect(
      request(app.getHttpServer())
        .post('/api/auth/google/link/challenge')
        .set('Authorization', `Bearer ${owner.accessToken}`),
    ).resolves.toMatchObject({ status: 409 });
  });

  it('allows only one deterministic completion when both transactions read one unused challenge', async () => {
    const session = await createSession();
    const challenge = await createChallenge(session);
    const credential = credentialFor(session, challenge);
    verifier.verify.mockResolvedValue(credential);

    const responses = await runWithTransactionReadBarrier(2, () =>
      Promise.all([
        request(app.getHttpServer())
          .post('/api/auth/google/link')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .send({
            challengeId: challenge.challengeId,
            credential: 'first-token',
          }),
        request(app.getHttpServer())
          .post('/api/auth/google/link')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .send({
            challengeId: challenge.challengeId,
            credential: 'second-token',
          }),
      ]),
    );

    expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
    const loser = responses.find(({ status }) => status !== 200);
    expect(loser).toBeDefined();
    expect([401, 409]).toContain(loser!.status);
    await expect(getStatus(session)).resolves.toEqual({
      provider: 'google',
      enabled: true,
      clientId: GOOGLE_CLIENT_ID,
      linked: true,
    });
  });

  it('allows only one deterministic concurrent owner for one Google subject', async () => {
    const first = await createSession();
    const second = await createSession();
    const firstChallenge = await createChallenge(first);
    const secondChallenge = await createChallenge(second);
    const sub = randomUUID();
    let calls = 0;
    let release!: () => void;
    const bothVerified = new Promise<void>((resolve) => {
      release = resolve;
    });
    verifier.verify.mockImplementation(async (token: string) => {
      calls += 1;
      if (calls === 2) release();
      await bothVerified;
      return token === 'first-token'
        ? credentialFor(first, firstChallenge, sub)
        : credentialFor(second, secondChallenge, sub);
    });

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/google/link')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .send({
          challengeId: firstChallenge.challengeId,
          credential: 'first-token',
        }),
      request(app.getHttpServer())
        .post('/api/auth/google/link')
        .set('Authorization', `Bearer ${second.accessToken}`)
        .send({
          challengeId: secondChallenge.challengeId,
          credential: 'second-token',
        }),
    ]);

    expect(calls).toBe(2);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const statuses = await Promise.all([getStatus(first), getStatus(second)]);
    expect(statuses.filter(({ linked }) => linked)).toHaveLength(1);
  });

  afterEach(async () => {
    if (createdUserIds.length) {
      const userIds = createdUserIds.splice(0);
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  afterAll(async () => {
    await app.close();
  });
});
