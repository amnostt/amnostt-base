import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import type { CurrentUser } from './../src/auth/auth.types';
import { GoogleTokenVerifier } from './../src/auth/google-token-verifier';
import { Prisma } from './../src/generated/prisma/client';
import { PrismaService } from './../src/prisma.service';

const GOOGLE_CLIENT_ID = 'google-client-id.apps.googleusercontent.com';
const PASSWORD = 'test-password-123';
const GOOGLE_PROOF_COOKIE = 'google_login_proof=';

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
  proofCookie: string;
};
type GoogleCredential = {
  sub: string;
  email: string;
  emailVerified: boolean;
  nonce: string;
};

describe('Google sign-in (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let verifier: { verify: jest.Mock<Promise<GoogleCredential>, [string]> };
  const createdUserIds: string[] = [];

  function setCookie(response: Response, prefix: string): string {
    const cookies = response.headers['set-cookie'] as string[] | undefined;
    const cookie = cookies?.find((value) => value.startsWith(prefix));
    expect(cookie).toEqual(expect.any(String));
    return cookie!;
  }

  function refreshCookie(response: Response): string {
    return setCookie(response, 'refresh_token=');
  }

  function errorBody(response: Response): ErrorResponse {
    const body: unknown = response.body;
    return body as ErrorResponse;
  }

  async function createSession(
    email = `${randomUUID()}@example.com`,
  ): Promise<Session> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    const body = (
      response.body as unknown as SuccessResponse<{
        accessToken: string;
        currentUser: CurrentUser;
      }>
    ).data;
    createdUserIds.push(body.currentUser.id);
    return {
      email: email.toLowerCase(),
      userId: body.currentUser.id,
      accessToken: body.accessToken,
      refreshCookie: refreshCookie(response),
    };
  }

  async function createLinkedUser(
    email = `${randomUUID()}@example.com`,
    sub = randomUUID(),
  ): Promise<Session> {
    const session = await createSession(email);
    await prisma.googleIdentity.create({
      data: { userId: session.userId, googleSub: sub },
    });
    return session;
  }

  async function createChallenge(): Promise<Challenge> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/google/login/challenge')
      .expect(201);
    const body = (
      response.body as unknown as SuccessResponse<
        Omit<Challenge, 'proofCookie'>
      >
    ).data;
    return {
      ...body,
      proofCookie: setCookie(response, GOOGLE_PROOF_COOKIE),
    };
  }

  function credentialFor(
    challenge: Challenge,
    session: Session,
    sub: string,
  ): GoogleCredential {
    return {
      sub,
      email: session.email,
      emailVerified: true,
      nonce: challenge.nonce,
    };
  }

  async function login(
    challenge: Challenge,
    credential: GoogleCredential,
    proofCookie = challenge.proofCookie,
  ): Promise<Response> {
    verifier.verify.mockResolvedValueOnce(credential);
    return request(app.getHttpServer())
      .post('/api/auth/google/login')
      .set('Cookie', proofCookie)
      .send({
        challengeId: challenge.challengeId,
        credential: 'mock-google-id-token',
      });
  }

  async function runWithTransactionReadBarrier<T>(
    expectedReads: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const runner = prisma as unknown as {
      $transaction: (
        callback: (transaction: unknown) => Promise<unknown>,
        options?: { isolationLevel?: unknown },
      ) => Promise<unknown>;
    };
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
      invokeTransaction(async (transaction: Prisma.TransactionClient) => {
        const challengeDelegate = transaction.googleLoginChallenge;
        const originalFindUnique =
          challengeDelegate.findUnique.bind(challengeDelegate);
        const gatedDelegate = {
          findUnique: async (
            ...args: Parameters<typeof challengeDelegate.findUnique>
          ) => {
            const result = await originalFindUnique(...args);
            reads += 1;
            if (reads === expectedReads) release();
            await readBarrier;
            return result;
          },
          updateMany: challengeDelegate.updateMany.bind(challengeDelegate),
        } as typeof challengeDelegate;
        const gatedTransaction = Object.create(
          transaction,
        ) as Prisma.TransactionClient;
        Object.defineProperty(gatedTransaction, 'googleLoginChallenge', {
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

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'google-test-access-secret-32-characters';
    process.env.JWT_REFRESH_SECRET = 'google-test-refresh-secret-32-characters';
    process.env.JWT_ACCESS_TTL_SECONDS = '900';
    process.env.JWT_REFRESH_TTL_SECONDS = '604800';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_REGISTRATION_DEFAULT_ROLE = 'Member';
    process.env.AUTH_REGISTRATION_IP_LIMIT = '1000';
    process.env.AUTH_REGISTRATION_IP_TTL_SECONDS = '900';
    process.env.AUTH_REGISTRATION_EMAIL_LIMIT = '1000';
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

  it('exposes only public Google configuration without authentication or secrets', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/google/config')
      .expect(200);

    expect(response.body).toEqual({
      data: {
        provider: 'google',
        enabled: true,
        clientId: GOOGLE_CLIENT_ID,
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /secret|nonce|hash|sub|token/i,
    );
  });

  it('issues a browser-bound nonce challenge with strict HttpOnly cookie scope', async () => {
    const challenge = await createChallenge();

    expect(challenge).toEqual({
      challengeId: expect.any(String) as string,
      nonce: expect.any(String) as string,
      expiresAt: expect.any(String) as string,
      proofCookie: expect.stringContaining(GOOGLE_PROOF_COOKIE) as string,
    });
    expect(challenge.proofCookie).toContain('Path=/api/auth/google');
    expect(challenge.proofCookie).toContain('HttpOnly');
    expect(challenge.proofCookie).toContain('SameSite=Strict');
    expect(challenge.proofCookie).not.toContain(challenge.nonce);
    expect(JSON.stringify(challenge)).not.toContain('hash');
  });

  it('signs in an already linked active user with the existing session contract', async () => {
    const sub = randomUUID();
    const session = await createLinkedUser('Linked-User@example.com', sub);
    const challenge = await createChallenge();
    const response = await login(
      challenge,
      credentialFor(challenge, session, sub),
    );

    expect(response.status).toBe(200);
    const body = (
      response.body as unknown as SuccessResponse<{
        accessToken: string;
        currentUser: CurrentUser;
      }>
    ).data;
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.currentUser).toMatchObject({
      id: session.userId,
      email: 'linked-user@example.com',
      role: 'Member',
      permissions: expect.any(Array) as string[],
    });
    const newRefreshCookie = refreshCookie(response);
    expect(newRefreshCookie).toContain('HttpOnly');
    expect(newRefreshCookie).toContain('SameSite=Strict');
    expect(newRefreshCookie).toContain('Path=/api/auth');
    expect(setCookie(response, GOOGLE_PROOF_COOKIE)).toContain(
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect({ data: { currentUser: body.currentUser } });
  });

  it.each([
    { description: 'an unknown Google subject', kind: 'unknown' as const },
    { description: 'an unlinked local account', kind: 'unlinked' as const },
    { description: 'an inactive linked account', kind: 'inactive' as const },
  ])(
    'uses one generic unauthorized response for $description without issuing a session',
    async ({ kind }) => {
      const session = await createSession();
      const sub = randomUUID();
      if (kind === 'inactive') {
        await prisma.googleIdentity.create({
          data: { userId: session.userId, googleSub: sub },
        });
      }
      if (kind === 'inactive') {
        await prisma.user.update({
          where: { id: session.userId },
          data: { isActive: false },
        });
      }
      const sessionCountBefore = await prisma.session.count({
        where: { userId: session.userId },
      });
      const challenge = await createChallenge();
      const response = await login(
        challenge,
        credentialFor(challenge, session, sub),
      );

      expect(response.status).toBe(401);
      expect(errorBody(response)).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Invalid Google credentials' },
      });
      expect(response.headers['set-cookie'] ?? []).not.toEqual(
        expect.arrayContaining([expect.stringContaining('refresh_token=')]),
      );
      await expect(
        prisma.session.count({ where: { userId: session.userId } }),
      ).resolves.toBe(sessionCountBefore);
      expect(verifier.verify).toHaveBeenCalledTimes(1);
    },
  );

  it('resolves a linked identity by stable subject rather than the credential email', async () => {
    const sub = randomUUID();
    const session = await createLinkedUser(undefined, sub);
    const challenge = await createChallenge();
    const credential = credentialFor(challenge, session, sub);
    credential.email = 'different@example.com';

    await expect(login(challenge, credential)).resolves.toMatchObject({
      status: 200,
    });
  });

  it.each([
    { description: 'a verifier failure', error: new Error('bad signature') },
    {
      description: 'a missing verified email claim',
      error: new Error('claims'),
    },
  ])('rejects $description without issuing auth tokens', async ({ error }) => {
    const session = await createSession();
    const challenge = await createChallenge();
    verifier.verify.mockRejectedValueOnce(error);
    const response = await request(app.getHttpServer())
      .post('/api/auth/google/login')
      .set('Cookie', challenge.proofCookie)
      .send({
        challengeId: challenge.challengeId,
        credential: 'mock-google-id-token',
      })
      .expect(401);

    expect(errorBody(response).error.message).toBe(
      'Invalid Google credentials',
    );
    expect(response.headers['set-cookie'] ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining('refresh_token=')]),
    );
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: session.email, password: PASSWORD })
      .expect(200);
  });

  it.each([
    { description: 'a wrong browser proof', proof: 'google_login_proof=wrong' },
    { description: 'a wrong nonce', proof: 'challenge' },
  ])(
    'rejects $description without creating a session',
    async ({ description, proof }) => {
      const sub = randomUUID();
      const session = await createLinkedUser(undefined, sub);
      const challenge = await createChallenge();
      const credential = credentialFor(challenge, session, sub);
      if (description === 'a wrong nonce') credential.nonce = 'wrong-nonce';
      const response = await login(
        challenge,
        credential,
        description === 'a wrong browser proof' ? proof : challenge.proofCookie,
      );

      expect(response.status).toBe(401);
      expect(errorBody(response).error.message).toBe(
        'Invalid Google credentials',
      );
      expect(response.headers['set-cookie'] ?? []).not.toEqual(
        expect.arrayContaining([expect.stringContaining('refresh_token=')]),
      );
    },
  );

  it('rejects a missing or cross-challenge browser proof without session fixation', async () => {
    const sub = randomUUID();
    const session = await createLinkedUser(undefined, sub);
    const challenge = await createChallenge();
    const otherChallenge = await createChallenge();
    const credential = credentialFor(challenge, session, sub);

    const missingCookie = await request(app.getHttpServer())
      .post('/api/auth/google/login')
      .send({
        challengeId: challenge.challengeId,
        credential: 'missing-proof-token',
      });
    expect(missingCookie.status).toBe(401);
    expect(errorBody(missingCookie).error.message).toBe(
      'Invalid Google credentials',
    );

    verifier.verify.mockResolvedValueOnce(credential);
    const crossChallenge = await request(app.getHttpServer())
      .post('/api/auth/google/login')
      .set('Cookie', otherChallenge.proofCookie)
      .send({
        challengeId: challenge.challengeId,
        credential: 'cross-challenge-token',
      });
    expect(crossChallenge.status).toBe(401);
    expect(errorBody(crossChallenge).error.message).toBe(
      'Invalid Google credentials',
    );
  });

  it('rejects malformed input and preserves the proof and refresh session state', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/google/login')
      .send({ challengeId: 'not-a-uuid', credential: '' })
      .expect(400);

    expect(errorBody(response).error.code).toBe('VALIDATION_FAILED');
    expect(response.headers['set-cookie'] ?? []).toEqual([]);
  });

  it('consumes a challenge once and rejects replay and expiry', async () => {
    const sub = randomUUID();
    const session = await createLinkedUser(undefined, sub);
    const challenge = await createChallenge();
    const credential = credentialFor(challenge, session, sub);

    await expect(login(challenge, credential)).resolves.toMatchObject({
      status: 200,
    });
    await expect(login(challenge, credential)).resolves.toMatchObject({
      status: 401,
    });

    const expiredChallenge = await createChallenge();
    await prisma.googleLoginChallenge.update({
      where: { id: expiredChallenge.challengeId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(
      login(expiredChallenge, credentialFor(expiredChallenge, session, sub)),
    ).resolves.toMatchObject({ status: 401 });
  });

  it('allows only one same-challenge completion after both transactions read unused state', async () => {
    const sub = randomUUID();
    const session = await createLinkedUser(undefined, sub);
    const challenge = await createChallenge();
    const credential = credentialFor(challenge, session, sub);
    verifier.verify.mockResolvedValue(credential);

    const responses: Response[] = await runWithTransactionReadBarrier(2, () =>
      Promise.all([
        request(app.getHttpServer())
          .post('/api/auth/google/login')
          .set('Cookie', challenge.proofCookie)
          .send({
            challengeId: challenge.challengeId,
            credential: 'first-token',
          }),
        request(app.getHttpServer())
          .post('/api/auth/google/login')
          .set('Cookie', challenge.proofCookie)
          .send({
            challengeId: challenge.challengeId,
            credential: 'second-token',
          }),
      ]),
    );

    expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(responses.filter(({ status }) => status === 401)).toHaveLength(1);
    const winner = responses.find(({ status }) => status === 200)!;
    const winnerBody = (
      winner.body as unknown as SuccessResponse<{ accessToken: string }>
    ).data;
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${winnerBody.accessToken}`)
      .expect(200);
    expect(
      responses.filter(({ headers }) =>
        ((headers['set-cookie'] as string[] | undefined) ?? []).some(
          (cookie: string) => cookie.startsWith('refresh_token='),
        ),
      ),
    ).toHaveLength(1);
  });

  it('fails closed when Google configuration is missing while local auth remains available', async () => {
    const configService = app.get(ConfigService);
    const previousClientId = configService.get<string>('GOOGLE_CLIENT_ID');
    configService.set('GOOGLE_CLIENT_ID', '');
    try {
      await request(app.getHttpServer())
        .get('/api/auth/google/config')
        .expect(200)
        .expect({
          data: { provider: 'google', enabled: false, clientId: null },
        });
      await request(app.getHttpServer())
        .post('/api/auth/google/login/challenge')
        .expect(503);
      await request(app.getHttpServer())
        .post('/api/auth/google/login')
        .send({ challengeId: randomUUID(), credential: 'mock-google-id-token' })
        .expect(503);
    } finally {
      configService.set('GOOGLE_CLIENT_ID', previousClientId);
    }
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
