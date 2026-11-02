import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SessionStore } from '../../application/session-store';
import { GoogleIdentityAdapter, GoogleIdentityApi } from '../google-sign-in/google-sign-in';
import { Login } from './login';

describe('Login Google flow', () => {
  let fixture: ComponentFixture<Login>;
  let http: HttpTestingController;
  let google: GoogleIdentityApi;

  beforeEach(async () => {
    google = { initialize: vi.fn(), renderButton: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: GoogleIdentityAdapter, useValue: { load: vi.fn().mockResolvedValue(google) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Login);
    http.expectOne('/api/auth/google/config').flush({
      data: { provider: 'google', enabled: true, clientId: 'google-client-id' },
    });
    await Promise.resolve();
    http.expectOne('/api/auth/google/login/challenge').flush({
      data: {
        challengeId: 'challenge-id',
        nonce: 'nonce-value',
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('uses the official popup button and submits only the challenge proof', async () => {
    expect(google.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'google-client-id',
        nonce: 'nonce-value',
        ux_mode: 'popup',
      }),
    );
    expect(google.renderButton).toHaveBeenCalled();

    const callback = vi.mocked(google.initialize).mock.calls[0][0].callback;
    callback({ credential: 'google-id-token' });
    const request = http.expectOne('/api/auth/google/login');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.body).toEqual({
      challengeId: 'challenge-id',
      credential: 'google-id-token',
    });

    request.flush({
      data: {
        accessToken: 'private-google-access-token',
        currentUser: {
          id: 'user-1',
          email: 'maria@example.com',
          name: 'María García',
          role: 'Member',
          permissions: [],
        },
      },
    });
    await fixture.whenStable();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true });
    expect(fixture.nativeElement.textContent).not.toContain('private-google-access-token');
  });

  it('rejects a ready callback after same-user logout and relogin without submitting Google login', async () => {
    const callback = vi.mocked(google.initialize).mock.calls[0][0].callback;
    const store = TestBed.inject(SessionStore);
    const logout = store.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await logout;
    const login = store.login({ email: 'maria@example.com', password: 'example-only-password' });
    http.expectOne('/api/auth/login').flush({
      data: {
        accessToken: 'new-session-token',
        currentUser: {
          id: 'user-1',
          email: 'maria@example.com',
          name: 'María García',
          role: 'Member',
          permissions: [],
        },
      },
    });
    await login;

    callback({ credential: 'stale-google-credential' });
    await fixture.whenStable();
    expect(http.match('/api/auth/google/login')).toHaveLength(0);
    expect(TestBed.inject(Router).navigateByUrl).not.toHaveBeenCalled();
  });

  it('keeps popup waiting separate from submission and permits local cancellation', async () => {
    expect(fixture.nativeElement.textContent).toContain('Cancelar');
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Cancelar'))?.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Reintentar Google');
    http.expectNone('/api/auth/google/login');
  });
});
