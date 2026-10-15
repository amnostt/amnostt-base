import { BreakpointObserver } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import { App } from './app';
import { routes } from './app.routes';
import { SessionStore } from './features/auth/application/session-store';

describe('Protected application routes', () => {
  const currentUser = {
    id: 'example-user-id',
    email: 'maria@example.com',
    name: 'María García',
    role: 'Member',
    permissions: ['tasks:read:own'],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideZard(),
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: false, breakpoints: {} }) },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function resolveAnonymousSession() {
    const bootstrap = TestBed.inject(SessionStore).bootstrap();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/refresh')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await bootstrap;
  }

  async function authenticate() {
    const login = TestBed.inject(SessionStore).login({
      email: currentUser.email,
      password: 'example-only-password',
    });
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/login')
      .flush({ data: { accessToken: 'example-access-token', currentUser } });
    await login;
  }

  async function render(path: string) {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl(path);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('keeps login public without restoring a session or rendering the shell', async () => {
    const fixture = await render('/login');
    const element = fixture.nativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(element.querySelector('app-login')).not.toBeNull();
    expect(element.querySelector('app-app-shell')).toBeNull();
    expect(element.querySelector('[data-slot="sidebar"]')).toBeNull();
    expect(TestBed.inject(SessionStore).state().status).toBe('bootstrap-loading');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it.each(['/', '/403', '/no-existe'])(
    'redirects an anonymous visitor from %s without rendering protected content',
    async (path) => {
      await resolveAnonymousSession();
      const fixture = await render(path);
      const element = fixture.nativeElement as HTMLElement;
      expect(TestBed.inject(Router).url).toBe('/login');
      expect(element.querySelector('app-login')).not.toBeNull();
      expect(element.querySelector('app-app-shell')).toBeNull();
      expect(element.querySelector('[data-slot="sidebar"]')).toBeNull();
      expect(TestBed.inject(SessionStore).state().status).toBe('unauthenticated');
      TestBed.inject(HttpTestingController).expectNone(() => true);
    },
  );

  it.each([
    ['/', 'Inicio'],
    ['/403', 'Acceso denegado'],
    ['/no-existe', 'Página no encontrada'],
  ])('allows an authenticated visitor to %s without restoring again', async (path, heading) => {
    await authenticate();
    const fixture = await render(path);
    const element = fixture.nativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe(path);
    expect(element.querySelector('app-app-shell')).not.toBeNull();
    expect(element.querySelector('h1')?.textContent).toContain(heading);
    expect(element.querySelector('app-login')).toBeNull();
    expect(TestBed.inject(SessionStore).state().status).toBe('authenticated');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('waits for shared restoration and admits the visitor only after user lookup', async () => {
    const store = TestBed.inject(SessionStore);
    const http = TestBed.inject(HttpTestingController);
    const bootstrap = store.bootstrap();
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    let completed = false;
    const navigation = router.navigateByUrl('/403').then((result) => {
      completed = true;
      return result;
    });
    const refresh = await vi.waitFor(() => http.expectOne('/api/auth/refresh'));
    fixture.detectChanges();
    expect(completed).toBe(false);
    expect(fixture.nativeElement.querySelector('app-app-shell')).toBeNull();
    refresh.flush({ data: { accessToken: 'example-restored-token' } });
    const me = await vi.waitFor(() => http.expectOne('/api/auth/me'));
    fixture.detectChanges();
    expect(completed).toBe(false);
    expect(fixture.nativeElement.querySelector('app-app-shell')).toBeNull();
    me.flush({ data: { currentUser } });
    await bootstrap;
    expect(await navigation).toBe(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/403');
    expect(store.state().status).toBe('authenticated');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Acceso denegado');
    http.expectNone(() => true);
  });

  it('starts unresolved restoration and redirects when it fails', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    const navigation = router.navigateByUrl('/');
    const refresh = await vi.waitFor(() => http.expectOne('/api/auth/refresh'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-app-shell')).toBeNull();
    refresh.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await navigation).toBe(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/login');
    expect(fixture.nativeElement.querySelector('app-login')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-app-shell')).toBeNull();
    expect(TestBed.inject(SessionStore).state().status).toBe('unauthenticated');
    http.expectNone(() => true);
  });

  it('rechecks the session when navigating between children of an existing shell', async () => {
    await authenticate();
    const fixture = await render('/');
    expect(fixture.nativeElement.querySelector('app-app-shell')).not.toBeNull();
    await resolveAnonymousSession();
    await TestBed.inject(Router).navigateByUrl('/403');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(fixture.nativeElement.querySelector('app-login')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-app-shell')).toBeNull();
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
});
