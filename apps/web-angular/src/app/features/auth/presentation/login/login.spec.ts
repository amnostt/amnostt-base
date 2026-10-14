import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../../application/session-store';
import { Login } from './login';

describe('Login presentation', () => {
  let fixture: ComponentFixture<Login>;
  let page: HTMLElement;
  let http: HttpTestingController;
  let store: SessionStore;

  const user = {
    id: 'user-1',
    email: 'person@example.com',
    name: 'Test User',
    role: 'user',
    permissions: [],
  };
  const session = { data: { accessToken: 'test-access-token', currentUser: user } };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SessionStore);
    fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  async function settleSubmission() {
    await fixture.whenStable();
    // DOM submit events do not expose the async handler's returned Promise.
    await Promise.resolve();
    fixture.detectChanges();
  }

  function startSubmit() {
    page
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  async function submit() {
    startSubmit();
    await fixture.whenStable();
  }

  async function enter(id: string, value: string) {
    const input = page.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  it('renders the selected layout with Spanish application copy', () => {
    expect(page.querySelector('h1')?.textContent).toBe('Inicia sesión en tu cuenta');
    expect(page.textContent).toContain('Amnostt Base');
    expect(page.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Iniciar sesión');
    expect(page.textContent).toContain('O continúa con');
    expect(page.textContent).toContain('¿No tienes una cuenta?');
    expect(page.textContent).not.toMatch(
      /Acme Inc\.|Login to|Login with|Forgot your password|Sign up/,
    );
    expect(page.querySelector('[data-login-layout]')?.classList.contains('lg:grid-cols-2')).toBe(
      true,
    );
    expect(page.querySelector('[data-login-cover]')?.classList.contains('lg:block')).toBe(true);
  });

  it('provides labelled credential fields and password-manager hints', () => {
    const email = page.querySelector<HTMLInputElement>('#email')!;
    const password = page.querySelector<HTMLInputElement>('#password')!;
    expect(page.querySelector('label[for="email"]')?.textContent).toBe('Correo electrónico');
    expect(page.querySelector('label[for="password"]')?.textContent).toBe('Contraseña');
    expect(email.type).toBe('email');
    expect(email.autocomplete).toBe('username');
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('current-password');
    expect(email.required && password.required).toBe(true);
    expect(page.querySelectorAll('[role="alert"]').length).toBe(0);
  });

  it('shows associated Spanish errors after submitting empty credentials', async () => {
    await submit();
    expect(page.querySelector('#email-error')?.textContent?.trim()).toBe(
      'Ingresa tu correo electrónico.',
    );
    expect(page.querySelector('#password-error')?.textContent?.trim()).toBe(
      'Ingresa tu contraseña.',
    );
    for (const id of ['email', 'password']) {
      const input = page.querySelector<HTMLInputElement>(`#${id}`)!;
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(`${id}-error`);
      expect(input.value).toBe('');
    }
    expect(page.querySelector('button[type="submit"]')?.textContent).not.toContain('Ingresando');
    http.expectNone('/api/auth/login');
  });

  it('validates email without applying a registration password-length rule', async () => {
    await enter('email', 'not-an-email');
    await enter('password', 'x');
    await submit();
    expect(page.querySelector('#email-error')?.textContent?.trim()).toBe(
      'Ingresa un correo electrónico válido.',
    );
    expect(page.querySelector('#password-error')).toBeNull();
    http.expectNone('/api/auth/login');
    await enter('email', 'person@example.com');
    startSubmit();
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ email: 'person@example.com', password: 'x' });
    request.flush(null, { status: 401, statusText: 'Unauthorized' });
    await settleSubmission();
    expect(page.querySelector('#email-error')).toBeNull();
    expect(page.querySelector<HTMLInputElement>('#password')!.value).toBe('x');
    expect(page.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Iniciar sesión');
  });

  it('keeps secondary actions visible but explicitly unavailable', () => {
    const labels = ['¿Olvidaste tu contraseña?', 'Continuar con GitHub', 'Regístrate'];
    for (const label of labels) {
      const button = Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find(
        (element) => element.textContent?.trim() === label,
      );
      expect(button?.disabled).toBe(true);
      expect(button?.type).toBe('button');
      expect(button?.title).toBe('Función de demostración; todavía no disponible.');
    }
    expect(page.textContent).toContain(
      'Las opciones adicionales son de demostración y aún no están disponibles.',
    );
    expect(page.querySelector('a[href="#"]')).toBeNull();
    expect(page.querySelector('img')).toBeNull();
  });

  async function fillCredentials() {
    await enter('email', user.email);
    await enter('password', 'test-password');
  }

  it('submits credentials through the store and renders its pending state', async () => {
    await fillCredentials();
    startSubmit();
    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ email: user.email, password: 'test-password' });
    expect(store.state()).toEqual({ status: 'login-submitting', email: user.email });
    expect(page.querySelector('form')!.getAttribute('aria-busy')).toBe('true');
    const button = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe('Ingresando…');
    request.flush(session);
    await settleSubmission();
  });

  it('ignores another submit while the first login is pending', async () => {
    await fillCredentials();
    startSubmit();
    const request = http.expectOne('/api/auth/login');
    startSubmit();
    http.expectNone('/api/auth/login');
    expect(store.state()).toEqual({ status: 'login-submitting', email: user.email });
    expect(page.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    request.flush(session);
    await settleSubmission();
  });

  it('clears the password after authenticated success without exposing the token', async () => {
    await fillCredentials();
    startSubmit();
    http.expectOne('/api/auth/login').flush(session);
    await settleSubmission();
    expect(store.state()).toEqual({ status: 'authenticated', user });
    expect(page.querySelector<HTMLInputElement>('#password')!.value).toBe('');
    expect(page.querySelector<HTMLInputElement>('#email')!.value).toBe(user.email);
    expect(page.querySelector('form')!.getAttribute('aria-busy')).toBe('false');
    const button = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(false);
    expect(button.textContent?.trim()).toBe('Iniciar sesión');
    expect(page.querySelectorAll('[role="alert"]').length).toBe(0);
    expect(JSON.stringify(store.state())).not.toContain('test-access-token');
    expect(page.textContent).not.toContain('test-access-token');
    expect(page.textContent).not.toContain('test-password');
  });

  it('shows a safe Spanish error and restores submission after a rejected login', async () => {
    await fillCredentials();
    startSubmit();
    http
      .expectOne('/api/auth/login')
      .flush(
        { message: 'private-server-detail test-password test-access-token' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settleSubmission();
    expect(store.state()).toEqual({ status: 'unauthenticated' });
    expect(page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.',
    );
    expect(page.querySelector('form')!.getAttribute('aria-busy')).toBe('false');
    expect(page.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(page.querySelector<HTMLInputElement>('#password')!.value).toBe('test-password');
    expect(page.textContent).not.toMatch(/private-server-detail|test-password|test-access-token/);
  });

  it('clears the previous server error when retrying valid credentials', async () => {
    await fillCredentials();
    startSubmit();
    http.expectOne('/api/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });
    await settleSubmission();
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
    startSubmit();
    const request = http.expectOne('/api/auth/login');
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Ingresando…');
    request.flush(session);
    await settleSubmission();
    expect(store.state()).toEqual({ status: 'authenticated', user });
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.querySelector<HTMLInputElement>('#password')!.value).toBe('');
  });
});
