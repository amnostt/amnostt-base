import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { ForgotPassword } from './forgot-password';

const successMessage =
  'Si existe una cuenta activa con ese correo, recibirás instrucciones para recuperar el acceso.';

interface ForgotPageHarness {
  fixture: ComponentFixture<ForgotPassword>;
  page: HTMLElement;
  http: HttpTestingController;
}

describe('ForgotPassword presentation', () => {
  let harness: ForgotPageHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(ForgotPassword);
    await fixture.whenStable();
    harness = {
      fixture,
      page: fixture.nativeElement as HTMLElement,
      http: TestBed.inject(HttpTestingController),
    };
  });

  afterEach(() => harness.http.verify());

  async function enter(value: string) {
    const input = harness.page.querySelector<HTMLInputElement>('#email')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  async function submit() {
    harness.page
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  async function settle() {
    await harness.fixture.whenStable();
    await Promise.resolve();
    harness.fixture.detectChanges();
  }

  it('renders the Spanish recovery hierarchy and a back-to-login link', () => {
    expect(harness.page.querySelector('h1')?.textContent).toBe('Recupera el acceso a tu cuenta');
    expect(harness.page.textContent).toContain(
      'Te enviaremos instrucciones para recuperar tu contraseña.',
    );
    expect(harness.page.textContent).toContain(
      '30 minutos. Un solo uso. Pedir otro enlace invalida el anterior.',
    );
    expect(harness.page.querySelector('label[for="email"]')?.textContent).toBe(
      'Correo electrónico',
    );
    expect(harness.page.querySelector('input[type="email"]')?.getAttribute('autocomplete')).toBe(
      'email',
    );
    expect(harness.page.querySelector('a[href="/login"]')?.textContent?.trim()).toBe(
      'Volver al inicio de sesión',
    );
  });

  it.each([
    ['', 'Ingresa tu correo electrónico.'],
    ['not-an-email', 'Ingresa un correo electrónico válido.'],
    ['a'.repeat(255) + '@example.com', 'Ingresa un correo electrónico válido.'],
  ])('rejects invalid email %j without a request', async (email, message) => {
    await enter(email);
    await submit();

    expect(harness.page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(message);
    expect(
      harness.page.querySelector<HTMLInputElement>('#email')?.getAttribute('aria-invalid'),
    ).toBe('true');
    harness.http.expectNone('/api/auth/forgot-password');
  });

  it('trims and lowercases the email in the public request', async () => {
    await enter('  Recovery@Example.COM  ');
    await submit();

    const request = harness.http.expectOne('/api/auth/forgot-password');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'recovery@example.com' });
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(harness.page.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
    expect(harness.page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true,
    );
    expect(harness.page.querySelector('[role="status"]')?.textContent?.trim()).toBe('Enviando…');

    request.flush({ data: { message: 'private response detail' } });
    await settle();
    expect(harness.page.querySelector('[role="status"]')?.textContent?.trim()).toBe(successMessage);
    expect(harness.page.textContent).not.toContain('private response detail');
    expect(harness.page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      false,
    );
  });

  it('prevents duplicate submissions while the request is pending', async () => {
    await enter('person@example.com');
    await submit();
    const request = harness.http.expectOne('/api/auth/forgot-password');

    await submit();
    harness.http.expectNone('/api/auth/forgot-password');
    expect(harness.page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true,
    );

    request.flush({ data: { message: successMessage } });
    await settle();
  });

  it('shows a safe rate-limit error and permits retry', async () => {
    await enter('person@example.com');
    await submit();
    harness.http
      .expectOne('/api/auth/forgot-password')
      .flush(
        { error: { code: 'TOO_MANY_REQUESTS', message: 'private throttle detail' } },
        { status: 429, statusText: 'Too Many Requests' },
      );
    await settle();

    expect(harness.page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.',
    );
    expect(harness.page.textContent).not.toContain('private throttle detail');
    expect(harness.page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      false,
    );

    await submit();
    const retry = harness.http.expectOne('/api/auth/forgot-password');
    expect(retry.request.body).toEqual({ email: 'person@example.com' });
    retry.flush({ data: { message: successMessage } });
    await settle();
    expect(harness.page.querySelector('[role="status"]')?.textContent?.trim()).toBe(successMessage);
  });

  it('shows a safe network error and permits retry', async () => {
    await enter('person@example.com');
    await submit();
    harness.http
      .expectOne('/api/auth/forgot-password')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'private network detail' } },
        { status: 0, statusText: 'Unknown Error' },
      );
    await settle();

    expect(harness.page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos procesar la solicitud. Inténtalo de nuevo.',
    );
    expect(harness.page.textContent).not.toContain('private network detail');
  });

  it('shows a safe unexpected-error message without server details', async () => {
    await enter('person@example.com');
    await submit();
    harness.http
      .expectOne('/api/auth/forgot-password')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'private unexpected detail' } },
        { status: 500, statusText: 'Server Error' },
      );
    await settle();

    expect(harness.page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos procesar la solicitud. Inténtalo de nuevo.',
    );
    expect(harness.page.textContent).not.toContain('private unexpected detail');
    expect(harness.page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      false,
    );
  });
});
