import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionStore } from '../../application/session-store';
import { permissionGuard } from './permission.guard';

it('does not authorize an obsolete session while guard authentication is pending', async () => {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const store = TestBed.inject(SessionStore);
  const http = TestBed.inject(HttpTestingController);
  const login = store.login({ email: 'a@example.com', password: 'example-password' });
  http.expectOne('/api/auth/login').flush({
    data: {
      accessToken: 'token',
      currentUser: {
        id: '1',
        email: 'a@example.com',
        name: 'A',
        role: 'Admin',
        permissions: ['tasks:read:any'],
      },
    },
  });
  await login;
  const policy = vi.fn(() => true);
  const gate = TestBed.runInInjectionContext(() =>
    permissionGuard(policy)({} as never, {} as never),
  );
  const pendingLogout = store.logout();
  expect(store.state().status).toBe('logout-pending');
  const result = await gate;
  expect(result instanceof Object && 'toString' in result ? result.toString() : result).toBe(
    '/login',
  );
  expect(policy).not.toHaveBeenCalled();
  http.expectOne('/api/auth/logout').flush(null);
  await pendingLogout;
  expect(store.state().status).toBe('unauthenticated');
  http.verify();
});
