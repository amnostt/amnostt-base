import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appConfig } from './app.config';
import { SessionStore } from './features/auth/application/session-store';

describe('Application session startup', () => {
  let http: HttpTestingController;
  let initialization: ApplicationInitStatus;
  let store: SessionStore;
  const user = {
    id: 'user-1',
    email: 'person@example.com',
    name: 'Test User',
    role: 'user',
    permissions: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    initialization = TestBed.inject(ApplicationInitStatus);
    store = TestBed.inject(SessionStore);
  });

  afterEach(() => http.verify());

  it('keeps initialization pending until refresh and current-user restoration complete', async () => {
    const refresh = http.expectOne('/api/auth/refresh');
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.body).toBeNull();
    expect(refresh.request.withCredentials).toBe(true);
    expect(initialization.done).toBe(false);
    expect(store.state()).toEqual({ status: 'bootstrap-loading' });

    refresh.flush({ data: { accessToken: 'test-access-token' } });
    const me = http.expectOne('/api/auth/me');
    expect(me.request.method).toBe('GET');
    expect(me.request.withCredentials).toBe(true);
    expect(me.request.headers.get('Authorization')).toBe('Bearer test-access-token');
    expect(initialization.done).toBe(false);
    expect(store.state()).toEqual({ status: 'bootstrap-loading' });

    me.flush({ data: { currentUser: user } });
    await initialization.donePromise;
    expect(initialization.done).toBe(true);
    expect(store.state()).toEqual({ status: 'authenticated', user });
    expect(JSON.stringify(store.state())).not.toContain('test-access-token');
    http.expectNone('/api/auth/login');
  });

  it('finishes startup unauthenticated when no session can be restored', async () => {
    expect(initialization.done).toBe(false);
    http.expectOne('/api/auth/refresh').flush(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
    await initialization.donePromise;
    expect(initialization.done).toBe(true);
    expect(store.state()).toEqual({ status: 'unauthenticated' });
    http.expectNone('/api/auth/me');
    http.expectNone('/api/auth/login');
  });

  it('shares the startup restoration with concurrent bootstrap consumers', async () => {
    const refresh = http.expectOne('/api/auth/refresh');
    const consumer = store.bootstrap();
    expect(store.bootstrap()).toBe(consumer);
    http.expectNone('/api/auth/refresh');
    expect(initialization.done).toBe(false);
    expect(store.state()).toEqual({ status: 'bootstrap-loading' });

    refresh.flush({ data: { accessToken: 'test-access-token' } });
    http.expectOne('/api/auth/me').flush({ data: { currentUser: user } });
    await Promise.all([consumer, initialization.donePromise]);
    expect(initialization.done).toBe(true);
    expect(store.state()).toEqual({ status: 'authenticated', user });
  });
});
