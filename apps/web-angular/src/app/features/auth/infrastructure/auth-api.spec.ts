import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { LoginInput, Session } from '../domain/auth-models';
import { AuthApi } from './auth-api';

describe('AuthApi', () => {
  let service: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('posts login credentials with cookies and returns the unwrapped session', async () => {
    const input: LoginInput = {
      email: 'maria@example.com',
      password: 'example-only-password',
    };
    const session: Session = {
      accessToken: 'example-access-token',
      currentUser: {
        id: 'example-user-id',
        email: input.email,
        name: 'María García',
        role: 'Member',
        permissions: ['tasks:read:own'],
      },
    };

    const result = firstValueFrom(service.login(input));
    const request = http.expectOne('/api/auth/login');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    expect(request.request.detectContentTypeHeader()).toBe('application/json');
    expect(request.request.withCredentials).toBe(true);

    request.flush({ data: session });
    expect(await result).toEqual(session);
  });

  it('propagates rejected credentials without producing a session', async () => {
    const failure = { error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } };
    const result = firstValueFrom(
      service.login({ email: 'maria@example.com', password: 'incorrect-example-password' }),
    );
    const request = http.expectOne('/api/auth/login');

    request.flush(failure, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toMatchObject({ status: 401, error: failure });
  });

  it('restores a session by refreshing first and then requesting the current user', async () => {
    const session: Session = {
      accessToken: 'example-restored-token',
      currentUser: {
        id: 'example-user-id',
        email: 'maria@example.com',
        name: 'María García',
        role: 'Member',
        permissions: ['tasks:read:own'],
      },
    };
    const result = firstValueFrom(service.restore());
    const refresh = http.expectOne('/api/auth/refresh');
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.withCredentials).toBe(true);
    http.expectNone('/api/auth/me');

    refresh.flush({ data: { accessToken: session.accessToken } });
    const me = http.expectOne('/api/auth/me');
    expect(me.request.method).toBe('GET');
    expect(me.request.withCredentials).toBe(true);
    expect(me.request.headers.get('Authorization')).toBe(`Bearer ${session.accessToken}`);
    me.flush({ data: { currentUser: session.currentUser } });

    expect(await result).toEqual(session);
  });

  it('does not request the user when the refresh cookie is rejected', async () => {
    const result = firstValueFrom(service.restore());
    const refresh = http.expectOne('/api/auth/refresh');
    refresh.flush(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    await expect(result).rejects.toMatchObject({ status: 401 });
    http.expectNone('/api/auth/me');
  });

  it('does not produce a session or refresh again when the current user request fails', async () => {
    const result = firstValueFrom(service.restore());
    http.expectOne('/api/auth/refresh').flush({ data: { accessToken: 'example-restored-token' } });
    http
      .expectOne('/api/auth/me')
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401, statusText: 'Unauthorized' },
      );

    await expect(result).rejects.toMatchObject({ status: 401 });
    http.expectNone('/api/auth/refresh');
  });

  it('posts logout with cookies and accepts an empty 204 response', async () => {
    const logout = firstValueFrom(service.logout());
    const request = http.expectOne('/api/auth/logout');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(null, { status: 204, statusText: 'No Content' });
    await expect(logout).resolves.toBeNull();
    http.expectNone(() => true);
  });

  it('propagates logout failure instead of reporting remote revocation as successful', async () => {
    const logout = firstValueFrom(service.logout());
    const rejection = expect(logout).rejects.toMatchObject({ status: 503 });
    http.expectOne('/api/auth/logout').flush(null, {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await rejection;
    http.expectNone(() => true);
  });
});
