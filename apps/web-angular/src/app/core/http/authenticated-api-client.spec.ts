import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { CurrentUser, LoginInput } from '@/features/auth/domain/auth-models';
import { SessionStore } from '@/features/auth/application/session-store';
import type { PaginatedResponse } from './pagination';
import { AuthenticatedApiClient } from './authenticated-api-client';

describe('AuthenticatedApiClient', () => {
  let client: AuthenticatedApiClient;
  let session: SessionStore;
  let http: HttpTestingController;
  const user: CurrentUser = {
    id: 'example-user-id',
    email: 'maria@example.com',
    name: 'María García',
    role: 'Member',
    permissions: ['tasks:read:own'],
  };
  const loginInput: LoginInput = {
    email: user.email,
    password: 'example-only-password',
  };
  const response: PaginatedResponse<{ id: string }> = {
    data: [{ id: 'example-task-id' }],
    meta: { page: 2, limit: 20, totalItems: 21, totalPages: 2 },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    client = TestBed.inject(AuthenticatedApiClient);
    session = TestBed.inject(SessionStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  async function authenticate() {
    const login = session.login(loginInput);
    http.expectOne('/api/auth/login').flush({
      data: { accessToken: 'example-login-token', currentUser: user },
    });
    await login;
  }

  it('uses the private session token and preserves the complete response envelope', async () => {
    await authenticate();

    const pending = client.get<typeof response>('/tasks');
    const request = http.expectOne('/api/tasks');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer example-login-token');
    expect(request.request.withCredentials).toBe(true);
    request.flush(response);

    await expect(pending).resolves.toEqual(response);
    expect(session.state()).toEqual({ status: 'authenticated', user });
    expect(JSON.stringify(session.state())).not.toContain('example-login-token');
  });

  it.each(['bootstrap-loading', 'unauthenticated'] as const)(
    'rejects without sending a request when the session is %s',
    async (status) => {
      if (status === 'unauthenticated') {
        const restoration = session.bootstrap();
        http.expectOne('/api/auth/refresh').flush(null, {
          status: 401,
          statusText: 'Unauthorized',
        });
        await restoration;
      }

      await expect(client.get('/tasks')).rejects.toBeInstanceOf(Error);
      expect(session.state()).toEqual({ status });
      http.expectNone(() => true);
    },
  );

  it.each(['https://example.org/tasks', '//example.org/tasks'])(
    'rejects the external URL %s without sending session credentials',
    async (path) => {
      await authenticate();

      await expect(client.get(path)).rejects.toBeInstanceOf(Error);
      expect(session.state()).toEqual({ status: 'authenticated', user });
      http.expectNone(() => true);
    },
  );

  it.each(['signed-out', 'signed-in-again'] as const)(
    'rejects a late response after logout when the user is %s',
    async (phase) => {
      await authenticate();

      const pending = client.get<typeof response>('/tasks');
      const rejection = expect(pending).rejects.toBeInstanceOf(Error);
      const request = http.expectOne('/api/tasks');
      const logout = session.logout();
      http.expectOne('/api/auth/logout').flush(null, {
        status: 204,
        statusText: 'No Content',
      });
      await logout;
      if (phase === 'signed-in-again') {
        await authenticate();
      }
      request.flush(response);

      await rejection;
      expect(session.state()).toEqual(
        phase === 'signed-out' ? { status: 'unauthenticated' } : { status: 'authenticated', user },
      );
      http.expectNone(() => true);
    },
  );

  describe('POST', () => {
    const input = { title: 'Prepare report', status: 'pending' };
    const created = { id: 'created-task-id', ...input, dueDate: null };

    it('sends the body with session credentials and returns the created resource', async () => {
      await authenticate();

      const pending = client.post<typeof created>('/tasks', input);
      const request = http.expectOne('/api/tasks');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(input);
      expect(request.request.headers.get('Authorization')).toBe('Bearer example-login-token');
      expect(request.request.withCredentials).toBe(true);
      request.flush(created);

      await expect(pending).resolves.toEqual(created);
      expect(session.state()).toEqual({ status: 'authenticated', user });
      expect(JSON.stringify(session.state())).not.toContain('example-login-token');
    });

    it.each(['bootstrap-loading', 'unauthenticated'] as const)(
      'rejects without sending a POST when the session is %s',
      async (status) => {
        if (status === 'unauthenticated') {
          const restoration = session.bootstrap();
          http.expectOne('/api/auth/refresh').flush(null, {
            status: 401,
            statusText: 'Unauthorized',
          });
          await restoration;
        }

        await expect(client.post('/tasks', input)).rejects.toBeInstanceOf(Error);
        expect(session.state()).toEqual({ status });
        http.expectNone(() => true);
      },
    );

    it.each(['https://example.org/tasks', '//example.org/tasks'])(
      'rejects POST to the external URL %s without sending credentials or data',
      async (path) => {
        await authenticate();

        await expect(client.post(path, input)).rejects.toBeInstanceOf(Error);
        expect(session.state()).toEqual({ status: 'authenticated', user });
        http.expectNone(() => true);
      },
    );

    it.each(['signed-out', 'signed-in-again'] as const)(
      'rejects a late POST result after logout when the user is %s',
      async (phase) => {
        await authenticate();

        const pending = client.post<typeof created>('/tasks', input);
        const rejection = expect(pending).rejects.toBeInstanceOf(Error);
        const request = http.expectOne('/api/tasks');
        const logout = session.logout();
        http.expectOne('/api/auth/logout').flush(null, {
          status: 204,
          statusText: 'No Content',
        });
        await logout;
        if (phase === 'signed-in-again') {
          await authenticate();
        }
        request.flush(created);

        await rejection;
        expect(session.state()).toEqual(
          phase === 'signed-out'
            ? { status: 'unauthenticated' }
            : { status: 'authenticated', user },
        );
        http.expectNone(() => true);
      },
    );

    it('preserves the API error for form feedback without changing the session', async () => {
      await authenticate();
      const errorBody = { message: 'Validation failed', details: [{ field: 'title' }] };

      const pending = client.post('/tasks', input);
      const rejection = expect(pending).rejects.toMatchObject({ status: 400, error: errorBody });
      const request = http.expectOne('/api/tasks');
      request.flush(errorBody, { status: 400, statusText: 'Bad Request' });

      await rejection;
      expect(session.state()).toEqual({ status: 'authenticated', user });
    });
  });

  it.each([
    '',
    'tasks',
    'https://example.org/tasks',
    '//example.org/tasks',
    '/\\example.org/tasks',
  ])('rejects GET path %j with exact feedback and no request or session change', async (path) => {
    await authenticate();
    const before = JSON.stringify(session.state());
    await expect(client.get(path)).rejects.toMatchObject({
      message: 'Only API-relative paths are allowed',
    });
    http.expectNone(() => true);
    expect(JSON.stringify(session.state())).toBe(before);
  });

  it('rejects GET during logout without sending a request or changing session state', async () => {
    await authenticate();
    const logout = session.logout();
    const request = http.expectOne('/api/auth/logout');
    const before = JSON.stringify(session.state());

    await expect(client.get('/tasks')).rejects.toMatchObject({
      message: 'An authenticated session is required',
    });
    http.expectNone(() => true);
    expect(JSON.stringify(session.state())).toBe(before);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await logout;
  });

  it('rejects an old GET result as soon as a replacement login starts', async () => {
    await authenticate();
    const pending = client.get('/tasks');
    const rejection = expect(pending).rejects.toMatchObject({
      message: 'Session changed during the request',
    });
    const request = http.expectOne('/api/tasks');
    const login = session.login(loginInput);
    const next = http.expectOne('/api/auth/login');
    const before = JSON.stringify(session.state());
    request.flush({ id: 'obsolete' });
    await rejection;

    expect(JSON.stringify(session.state())).toBe(before);
    next.flush({ data: { accessToken: 'replacement-token', currentUser: user } });
    await login;
    http.expectNone(() => true);
    expect(session.state()).toEqual({ status: 'authenticated', user });
  });

  it.each([
    '',
    'tasks',
    'https://example.org/tasks',
    '//example.org/tasks',
    '/\\example.org/tasks',
  ])('rejects POST path %j with exact feedback and no request or session change', async (path) => {
    await authenticate();
    const before = JSON.stringify(session.state());
    await expect(client.post(path, { title: 'Draft', status: 'pending' })).rejects.toMatchObject({
      message: 'Only API-relative paths are allowed',
    });
    http.expectNone(() => true);
    expect(JSON.stringify(session.state())).toBe(before);
  });

  it('rejects POST during logout without sending a request or changing session state', async () => {
    await authenticate();
    const logout = session.logout();
    const request = http.expectOne('/api/auth/logout');
    const before = JSON.stringify(session.state());

    await expect(
      client.post('/tasks', { title: 'Draft', status: 'pending' }),
    ).rejects.toMatchObject({
      message: 'An authenticated session is required',
    });
    http.expectNone(() => true);
    expect(JSON.stringify(session.state())).toBe(before);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await logout;
  });

  it('rejects an old POST result as soon as a replacement login starts', async () => {
    await authenticate();
    const pending = client.post('/tasks', { title: 'Draft', status: 'pending' });
    const rejection = expect(pending).rejects.toMatchObject({
      message: 'Session changed during the request',
    });
    const request = http.expectOne('/api/tasks');
    const login = session.login(loginInput);
    const next = http.expectOne('/api/auth/login');
    const before = JSON.stringify(session.state());
    request.flush({ id: 'obsolete' });
    await rejection;

    expect(JSON.stringify(session.state())).toBe(before);
    next.flush({ data: { accessToken: 'replacement-token', currentUser: user } });
    await login;
    http.expectNone(() => true);
    expect(session.state()).toEqual({ status: 'authenticated', user });
  });
});
