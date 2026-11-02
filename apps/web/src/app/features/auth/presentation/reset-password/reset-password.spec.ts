import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPassword } from './reset-password';

const validToken = 'a'.repeat(43);
const invalidLinkMessage = 'El enlace de recuperación no es válido o ha expirado.';
const rateLimitMessage = 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.';
const genericErrorMessage = 'No pudimos restablecer tu contraseña. Inténtalo de nuevo.';

interface ResetPageHarness {
  fixture: ComponentFixture<ResetPassword>;
  page: HTMLElement;
  http: HttpTestingController;
  router: Router;
}

describe('ResetPassword presentation', () => {
  async function createHarness(token: string | undefined): Promise<ResetPageHarness> {
    await TestBed.configureTestingModule({
      imports: [ResetPassword],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(token === undefined ? {} : { token }),
            },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ResetPassword);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    return {
      fixture,
      page: fixture.nativeElement as HTMLElement,
      http: TestBed.inject(HttpTestingController),
      router,
    };
  }

  async function enter(harness: ResetPageHarness, value: string) {
    const input = harness.page.querySelector<HTMLInputElement>('#new-password')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  async function submit(harness: ResetPageHarness) {
    harness.page
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  async function settle(harness: ResetPageHarness) {
    await harness.fixture.whenStable();
    await Promise.resolve();
    harness.fixture.detectChanges();
  }

  beforeEach(() => TestBed.resetTestingModule());

  it.each([undefined, '', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}!`])(
    'renders a safe invalid-link state for token %j without a reset request',
    async (token) => {
      const harness = await createHarness(token);

      expect(harness.page.querySelector('form')).toBeNull();
      expect(harness.page.textContent).toContain(invalidLinkMessage);
      expect(harness.page.querySelector('a[href="/forgot-password"]')).not.toBeNull();
      if (token) {
        expect(harness.page.textContent).not.toContain(token);
      }
      harness.http.expectNone('/api/auth/reset-password');
    },
  );

  it('renders a valid reset form without rendering the token', async () => {
    const harness = await createHarness(validToken);

    expect(harness.page.querySelector('h1')?.textContent).toBe('Crea una nueva contraseña');
    expect(harness.page.querySelector<HTMLInputElement>('#new-password')?.autocomplete).toBe(
      'new-password',
    );
    expect(harness.page.textContent).not.toContain(validToken);
    expect(harness.page.querySelector('a[href="/login"]')?.textContent?.trim()).toBe(
      'Volver al inicio de sesión',
    );
  });

  it.each([
    ['', 'Ingresa una nueva contraseña.'],
    ['a'.repeat(11), 'La contraseña debe tener entre 12 y 128 caracteres.'],
    ['a'.repeat(129), 'La contraseña debe tener entre 12 y 128 caracteres.'],
  ])('rejects a local password boundary %j without a request', async (password, message) => {
    const harness = await createHarness(validToken);
    await enter(harness, password);
    await submit(harness);

    expect(harness.page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(message);
    expect(
      harness.page.querySelector<HTMLInputElement>('#new-password')?.getAttribute('aria-invalid'),
    ).toBe('true');
    harness.http.expectNone('/api/auth/reset-password');
  });

  it.each([12, 128])('accepts the exact password boundary %i', async (length) => {
    const password = 'a'.repeat(length);
    const harness = await createHarness(validToken);
    await enter(harness, password);
    await submit(harness);

    const request = harness.http.expectOne('/api/auth/reset-password');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ token: validToken, newPassword: password });
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(harness.page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true,
    );
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle(harness);
  });

  it('prevents duplicate pending submissions and clears the password after success', async () => {
    const harness = await createHarness(validToken);
    await enter(harness, 'a'.repeat(12));
    await submit(harness);
    const request = harness.http.expectOne('/api/auth/reset-password');

    await submit(harness);
    harness.http.expectNone('/api/auth/reset-password');
    expect(harness.page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true,
    );

    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle(harness);
    expect(harness.page.querySelector<HTMLInputElement>('#new-password')?.value).toBe('');
    expect(harness.router.navigateByUrl).toHaveBeenCalledExactlyOnceWith('/login', {
      replaceUrl: true,
      state: { notice: 'password-reset-success' },
    });
    harness.http.expectNone('/api/auth/login');
    harness.http.expectNone('/api/auth/logout');
  });

  it('maps unauthorized reset responses to the exact safe invalid-link state', async () => {
    const harness = await createHarness(validToken);
    await enter(harness, 'a'.repeat(12));
    await submit(harness);
    harness.http
      .expectOne('/api/auth/reset-password')
      .flush(
        { error: { message: 'private expired-token detail' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle(harness);

    expect(harness.page.textContent).toContain(invalidLinkMessage);
    expect(harness.page.textContent).not.toContain('private expired-token detail');
    expect(harness.page.querySelector('a[href="/forgot-password"]')).not.toBeNull();
  });

  it.each([
    [429, rateLimitMessage, 'private throttle detail'],
    [0, genericErrorMessage, 'private network detail'],
    [500, genericErrorMessage, 'private server detail'],
  ] as const)('maps retryable reset failure %i safely', async (status, message, privateDetail) => {
    const harness = await createHarness(validToken);
    await enter(harness, 'a'.repeat(12));
    await submit(harness);
    harness.http
      .expectOne('/api/auth/reset-password')
      .flush({ error: { message: privateDetail } }, { status, statusText: 'Failure' });
    await settle(harness);

    expect(harness.page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(message);
    expect(harness.page.textContent).not.toContain(privateDetail);
    expect(harness.page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      false,
    );

    await submit(harness);
    const retry = harness.http.expectOne('/api/auth/reset-password');
    expect(retry.request.body).toEqual({ token: validToken, newPassword: 'a'.repeat(12) });
    retry.flush(null, { status: 204, statusText: 'No Content' });
    await settle(harness);
  });
});
