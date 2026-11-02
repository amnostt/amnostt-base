import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@/features/auth/application/session-store';
import { AccountApi } from '../infrastructure/account-api';
import {
  GoogleIdentityAdapter,
  GoogleIdentityApi,
} from '@/features/auth/presentation/google-sign-in/google-sign-in';
import { Account } from './account';

describe('Account presentation', () => {
  let fixture: ComponentFixture<Account>;
  let page: HTMLElement;
  let accountApi: {
    googleStatus: ReturnType<typeof vi.fn>;
    createGoogleLinkChallenge: ReturnType<typeof vi.fn>;
    linkGoogle: ReturnType<typeof vi.fn>;
  };
  let http: HttpTestingController;
  let google: GoogleIdentityApi;

  const user = {
    id: 'user-1',
    email: 'maria@example.com',
    name: 'María García',
    role: 'Member',
    permissions: ['tasks:read:own'],
  };

  beforeEach(async () => {
    google = { initialize: vi.fn(), renderButton: vi.fn() };
    accountApi = {
      googleStatus: vi.fn().mockResolvedValue({
        provider: 'google',
        enabled: true,
        clientId: 'google-client-id',
        linked: false,
      }),
      createGoogleLinkChallenge: vi.fn().mockResolvedValue({
        challengeId: 'challenge-id',
        nonce: 'nonce-value',
        expiresAt: '2030-01-01T00:00:00.000Z',
      }),
      linkGoogle: vi.fn().mockResolvedValue({ provider: 'google', linked: true }),
    };
    await TestBed.configureTestingModule({
      imports: [Account],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AccountApi, useValue: accountApi },
        {
          provide: GoogleIdentityAdapter,
          useValue: { load: vi.fn().mockResolvedValue(google) },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const login = TestBed.inject(SessionStore).login({
      email: user.email,
      password: 'example-only-password',
    });
    http.expectOne('/api/auth/login').flush({
      data: { accessToken: 'private-access-token', currentUser: user },
    });
    await login;
    fixture = TestBed.createComponent(Account);
    await fixture.whenStable();
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  it('renders only read-only account facts and the verified matching-email guidance', () => {
    expect(page.querySelector('h1')?.textContent).toContain('Cuenta');
    expect(page.textContent).toContain('María García');
    expect(page.textContent).toContain('maria@example.com');
    expect(page.textContent).toContain('Member');
    expect(page.textContent).toContain('mismo correo verificado');
    expect(page.textContent).not.toContain('tasks:read:own');
    expect(page.querySelector('input')).toBeNull();
  });

  it('prepares a fresh protected challenge only after the explicit link action', async () => {
    expect(accountApi.createGoogleLinkChallenge).not.toHaveBeenCalled();
    page.querySelector<HTMLButtonElement>('[data-action="start-google-link"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(accountApi.createGoogleLinkChallenge).toHaveBeenCalledOnce();
    expect(page.textContent).toContain('Continúa con Google');
    expect(page.querySelector('[data-google-button]')).not.toBeNull();
  });

  it('rejects a ready callback after same-user logout and relogin without submitting a link', async () => {
    page.querySelector<HTMLButtonElement>('[data-action="start-google-link"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const callback = vi.mocked(google.initialize).mock.calls[0][0].callback;

    const store = TestBed.inject(SessionStore);
    const logout = store.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await logout;
    const login = store.login({ email: user.email, password: 'example-only-password' });
    http.expectOne('/api/auth/login').flush({
      data: { accessToken: 'new-session-token', currentUser: user },
    });
    await login;

    callback({ credential: 'stale-link-credential' });
    await fixture.whenStable();
    expect(accountApi.linkGoogle).not.toHaveBeenCalled();
    expect(page.textContent).not.toContain('Vinculado');
    http.expectNone('/api/auth/google/link');
  });

  it('shows a safe unavailable state when the provider is disabled', async () => {
    accountApi.googleStatus.mockResolvedValue({
      provider: 'google',
      enabled: false,
      clientId: null,
      linked: false,
    });
    fixture.destroy();
    fixture = TestBed.createComponent(Account);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Google no está disponible');
    expect(fixture.nativeElement.querySelector('[data-action="start-google-link"]')).toBeNull();
  });
});
