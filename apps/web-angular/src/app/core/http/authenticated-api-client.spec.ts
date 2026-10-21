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
});
