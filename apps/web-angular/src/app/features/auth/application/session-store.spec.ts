import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { CurrentUser, LoginInput } from '../domain/auth-models';
import { SessionStore } from './session-store';

describe('SessionStore', () => {
  let service: SessionStore;
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
  const olderUser: CurrentUser = {
    id: 'older-example-user-id',
    email: 'otro@example.com',
    name: 'Usuario anterior',
    role: 'Admin',
    permissions: ['tasks:read:any'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SessionStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('starts pending session restoration rather than assuming the user is signed out', () => {
    expect(service.state()).toEqual({ status: 'bootstrap-loading' });
  });

  it('exposes state without public signal mutation methods', () => {
    expect(service.state).toBeTypeOf('function');
    expect(service.state).not.toHaveProperty('set');
    expect(service.state).not.toHaveProperty('update');
  });

  function finishRestore(restoredUser = user, accessToken = 'example-restored-token') {
    const refresh = http.expectOne('/api/auth/refresh');
    refresh.flush({ data: { accessToken } });
    http.expectOne('/api/auth/me').flush({ data: { currentUser: restoredUser } });
  }

  it('publishes the restored user only after restoration finishes', async () => {
    const pending = service.bootstrap();
    expect(service.state()).toEqual({ status: 'bootstrap-loading' });
    finishRestore();
    await pending;

    expect(service.state()).toEqual({ status: 'authenticated', user });
    expect(JSON.stringify(service.state())).not.toContain('example-restored-token');
  });

  it('settles as unauthenticated when no session can be restored', async () => {
    const pending = service.bootstrap();
    http
      .expectOne('/api/auth/refresh')
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } },
        { status: 401, statusText: 'Unauthorized' },
      );

    await expect(pending).resolves.toBeUndefined();
    expect(service.state()).toEqual({ status: 'unauthenticated' });
    http.expectNone('/api/auth/me');
  });

  it('shares one restoration and the same promise across concurrent bootstrap calls', async () => {
    const first = service.bootstrap();
    const second = service.bootstrap();
    expect(second).toBe(first);
    finishRestore();
    await Promise.all([first, second]);

    expect(service.state()).toEqual({ status: 'authenticated', user });
  });

  it('releases the completed attempt so an explicit retry can restore a session', async () => {
    const first = service.bootstrap();
    http.expectOne('/api/auth/refresh').flush(null, {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await first;
    expect(service.state()).toEqual({ status: 'unauthenticated' });

    const retry = service.bootstrap();
    expect(retry).not.toBe(first);
    finishRestore();
    await retry;

    expect(service.state()).toEqual({ status: 'authenticated', user });
  });

  it('publishes submission state and then authenticates the user without exposing credentials', async () => {
    const pending = service.login(loginInput);
    expect(service.state()).toEqual({ status: 'login-submitting', email: loginInput.email });
    expect(JSON.stringify(service.state())).not.toContain(loginInput.password);
    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(loginInput);
    expect(request.request.withCredentials).toBe(true);

    request.flush({ data: { accessToken: 'example-login-token', currentUser: user } });
    await expect(pending).resolves.toBeUndefined();

    expect(service.state()).toEqual({ status: 'authenticated', user });
    expect(service.state()).not.toHaveProperty('accessToken');
    expect(JSON.stringify(service.state())).not.toContain(loginInput.password);
  });

  it('clears submission state and propagates a rejected login for the caller to handle', async () => {
    const failure = { error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } };
    const pending = service.login(loginInput);
    const rejection = expect(pending).rejects.toMatchObject({ status: 401, error: failure });
    http.expectOne('/api/auth/login').flush(failure, { status: 401, statusText: 'Unauthorized' });

    await rejection;
    expect(service.state()).toEqual({ status: 'unauthenticated' });
    expect(JSON.stringify(service.state())).not.toContain(loginInput.password);
  });

  it('ignores a duplicate submission without invalidating the first login', async () => {
    const pending = service.login(loginInput);
    const request = http.expectOne('/api/auth/login');

    await service.login({ email: 'otro@example.com', password: 'another-example-password' });
    http.expectNone('/api/auth/login');
    expect(service.state()).toEqual({ status: 'login-submitting', email: loginInput.email });
    request.flush({ data: { accessToken: 'example-login-token', currentUser: user } });
    await pending;

    expect(service.state()).toEqual({ status: 'authenticated', user });
  });

  it('returns a settled promise when bootstrap is requested during login', async () => {
    const login = service.login(loginInput);
    const request = http.expectOne('/api/auth/login');

    const skipped = service.bootstrap();
    expect(skipped).toBeInstanceOf(Promise);
    await expect(skipped).resolves.toBeUndefined();
    http.expectNone('/api/auth/refresh');
    expect(service.state()).toEqual({ status: 'login-submitting', email: loginInput.email });

    request.flush({ data: { accessToken: 'example-login-token', currentUser: user } });
    await login;
    expect(service.state()).toEqual({ status: 'authenticated', user });
  });

  function finishOlderRestore(outcome: 'success' | 'failure') {
    if (outcome === 'success') {
      finishRestore(olderUser, 'older-example-token');
    } else {
      http.expectOne('/api/auth/refresh').flush(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
    }
  }

  it.each(['success', 'failure'] as const)(
    'does not let an older bootstrap %s overwrite an ongoing login',
    async (outcome) => {
      const restoration = service.bootstrap();
      const login = service.login(loginInput);
      const request = http.expectOne('/api/auth/login');

      finishOlderRestore(outcome);
      await restoration;
      expect(service.state()).toEqual({ status: 'login-submitting', email: loginInput.email });
      request.flush({ data: { accessToken: 'example-login-token', currentUser: user } });
      await login;

      expect(service.state()).toEqual({ status: 'authenticated', user });
    },
  );

  it.each(['success', 'failure'] as const)(
    'does not let an older bootstrap %s replace or clear a completed login',
    async (outcome) => {
      const restoration = service.bootstrap();
      const login = service.login(loginInput);
      http.expectOne('/api/auth/login').flush({
        data: { accessToken: 'example-login-token', currentUser: user },
      });
      await login;
      expect(service.state()).toEqual({ status: 'authenticated', user });

      finishOlderRestore(outcome);
      await restoration;

      expect(service.state()).toEqual({ status: 'authenticated', user });
    },
  );

  it('does not authenticate an older restored user after the newer login is rejected', async () => {
    const restoration = service.bootstrap();
    const login = service.login(loginInput);
    const rejection = expect(login).rejects.toMatchObject({ status: 401 });
    http.expectOne('/api/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });
    await rejection;
    expect(service.state()).toEqual({ status: 'unauthenticated' });

    finishOlderRestore('success');
    await restoration;

    expect(service.state()).toEqual({ status: 'unauthenticated' });
  });

  async function authenticate() {
    const login = service.login(loginInput);
    http.expectOne('/api/auth/login').flush({
      data: { accessToken: 'example-login-token', currentUser: user },
    });
    await login;
  }

  it('clears the displayed user during logout and blocks duplicate logout, login and restoration', async () => {
    await authenticate();
    const logout = service.logout();
    const request = http.expectOne('/api/auth/logout');
    expect(service.state()).toEqual({ status: 'logout-pending' });
    expect(JSON.stringify(service.state())).not.toContain(user.email);

    await expect(service.logout()).resolves.toBeUndefined();
    await expect(service.login(loginInput)).resolves.toBeUndefined();
    await expect(service.bootstrap()).resolves.toBeUndefined();
    expect(service.state()).toEqual({ status: 'logout-pending' });
    http.expectNone(() => true);

    request.flush(null, { status: 204, statusText: 'No Content' });
    await expect(logout).resolves.toBeUndefined();
    expect(service.state()).toEqual({ status: 'unauthenticated' });

    await authenticate();
    expect(service.state()).toEqual({ status: 'authenticated', user });
    http.expectNone(() => true);
  });

  it('clears local session state even when logout fails and exposes the error to the caller', async () => {
    await authenticate();
    const logout = service.logout();
    const rejection = expect(logout).rejects.toMatchObject({ status: 503 });
    expect(service.state()).toEqual({ status: 'logout-pending' });
    http.expectOne('/api/auth/logout').flush(null, {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await rejection;
    expect(service.state()).toEqual({ status: 'unauthenticated' });
    http.expectNone(() => true);
  });

  describe.each(['pending', 'completed'] as const)('when logout is %s', (phase) => {
    it.each(['success', 'failure'] as const)(
      'ignores an older login %s without restoring the session',
      async (outcome) => {
        const login = service.login(loginInput);
        const request = http.expectOne('/api/auth/login');
        const logout = service.logout();
        const logoutRequest = http.expectOne('/api/auth/logout');
        if (phase === 'completed') {
          logoutRequest.flush(null, { status: 204, statusText: 'No Content' });
          await logout;
        }

        if (outcome === 'success') {
          request.flush({ data: { accessToken: 'older-example-token', currentUser: olderUser } });
          await expect(login).resolves.toBeUndefined();
        } else {
          const rejection = expect(login).rejects.toMatchObject({ status: 401 });
          request.flush(null, { status: 401, statusText: 'Unauthorized' });
          await rejection;
        }
        expect(service.state()).toEqual({
          status: phase === 'pending' ? 'logout-pending' : 'unauthenticated',
        });
        if (phase === 'pending') {
          logoutRequest.flush(null, { status: 204, statusText: 'No Content' });
          await logout;
        }
        expect(service.state()).toEqual({ status: 'unauthenticated' });
        http.expectNone(() => true);
      },
    );

    it.each(['success', 'failure'] as const)(
      'ignores an older restoration %s without restoring the session',
      async (outcome) => {
        const restoration = service.bootstrap();
        const logout = service.logout();
        const logoutRequest = http.expectOne('/api/auth/logout');
        if (phase === 'completed') {
          logoutRequest.flush(null, { status: 204, statusText: 'No Content' });
          await logout;
        }

        finishOlderRestore(outcome);
        await restoration;
        expect(service.state()).toEqual({
          status: phase === 'pending' ? 'logout-pending' : 'unauthenticated',
        });
        if (phase === 'pending') {
          logoutRequest.flush(null, { status: 204, statusText: 'No Content' });
          await logout;
        }
        expect(service.state()).toEqual({ status: 'unauthenticated' });
        http.expectNone(() => true);
      },
    );
  });
});
