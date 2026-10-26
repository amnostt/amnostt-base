import { BreakpointObserver } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import { App } from './app';
import { routes } from './app.routes';
import { SessionStore } from './features/auth/application/session-store';

describe('App', () => {
  const viewport = new BehaviorSubject({ matches: false, breakpoints: {} });

  beforeEach(async () => {
    viewport.next({ matches: false, breakpoints: {} });
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideZard(),
        { provide: BreakpointObserver, useValue: { observe: () => viewport.asObservable() } },
      ],
    }).compileComponents();

    const login = TestBed.inject(SessionStore).login({
      email: 'elena@example.com',
      password: 'example-only-password',
    });
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/login')
      .flush({
        data: {
          accessToken: 'example-access-token',
          currentUser: {
            id: 'example-user-id',
            email: 'elena@example.com',
            name: 'Elena Torres',
            role: 'Member',
            permissions: ['tasks:read:own'],
          },
        },
      });
    await login;
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  async function render(path = '/') {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl(path);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renders the Spanish login outside the shell and restores the shell on Home', async () => {
    const fixture = await render('/login');
    const element = fixture.nativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(element.querySelector('app-login')).not.toBeNull();
    expect(element.querySelector('h1')?.textContent).toBe('Inicia sesión en tu cuenta');
    expect(element.querySelector('form')).not.toBeNull();
    expect(element.querySelector('app-app-shell')).toBeNull();
    expect(element.querySelector('[data-slot="sidebar"]')).toBeNull();
    expect(document.title).toBe('Iniciar sesión');
    TestBed.inject(HttpTestingController).expectNone('/api/auth/login');
    TestBed.inject(HttpTestingController).expectNone('/api/auth/refresh');

    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-login')).toBeNull();
    expect(element.querySelector('app-app-shell')).not.toBeNull();
    expect(element.querySelector('h1')?.textContent).toContain('Inicio');
    expect(document.title).toBe('Inicio');
  });

  it('renders the authenticated user alongside Spanish demonstration data', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toContain('Inicio');
    for (const text of [
      'Estudio Norte',
      'Plataforma',
      'Proyectos',
      'Elena Torres',
      'elena@example.com',
      'Demostración',
    ]) {
      expect(element.textContent).toContain(text);
    }
    expect(element.querySelector('[aria-label="Abrir menú de usuario"]')?.textContent).toContain(
      'ET',
    );
    expect(element.textContent).not.toContain('María García');
    expect(element.querySelector('[data-slot="sidebar-rail"]')).not.toBeNull();
    expect(element.querySelector('[data-slot="sidebar-trigger"]')?.getAttribute('aria-label')).toBe(
      'Alternar barra lateral',
    );
    expect(element.querySelector('[data-slot="sidebar-trigger"]')?.textContent).toContain(
      'Alternar barra lateral',
    );
    expect(element.textContent).not.toMatch(/Toggle Sidebar|Platform|Projects|Data Fetching/);
    expect(element.querySelector('a[href="#"]')).toBeNull();
    expect(element.querySelector('a[aria-current="page"]')?.textContent).toContain('Inicio');
  });

  it('keeps the same shell while the child route and breadcrumb change', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const shell = element.querySelector('app-app-shell');
    await TestBed.inject(Router).navigateByUrl('/403');
    await fixture.whenStable();
    expect(element.querySelector('app-app-shell')).toBe(shell);
    expect(element.querySelector('h1')?.textContent).toContain('Acceso denegado');
    expect(element.querySelector('[aria-current="page"]')?.textContent).toContain(
      'Acceso denegado',
    );
    expect(document.title).toContain('Acceso denegado');
    await TestBed.inject(Router).navigateByUrl('/no-existe');
    await fixture.whenStable();
    expect(element.querySelector('app-app-shell')).toBe(shell);
    expect(element.querySelector('h1')?.textContent).toContain('Página no encontrada');
  });

  it('collapses and expands the sidebar without leaving the current page', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector<HTMLButtonElement>('[data-slot="sidebar-trigger"]')!;
    trigger.click();
    await fixture.whenStable();
    expect(element.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')).toBe(
      'collapsed',
    );
    trigger.click();
    await fixture.whenStable();
    expect(element.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')).toBe(
      'expanded',
    );
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('keeps account actions visibly unavailable and in Spanish', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('[aria-label="Abrir menú de usuario"]')!.click();
    await fixture.whenStable();
    const menu = document.body.querySelector('[role="menu"]')!;
    expect(menu.textContent).toContain('Elena Torres');
    expect(menu.textContent).not.toContain('Datos de usuario ficticios');
    for (const label of ['Mejorar plan', 'Cuenta', 'Facturación', 'Notificaciones']) {
      const action = Array.from(menu.querySelectorAll('[role="menuitem"]')).find((item) =>
        item.textContent?.includes(label),
      );
      expect(action?.getAttribute('aria-disabled')).toBe('true');
    }
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it.each([204, 503])(
    'logs out from the rendered menu and silently replaces the route after HTTP %s',
    async (status) => {
      const fixture = await render();
      const element = fixture.nativeElement as HTMLElement;
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigateByUrl');
      const http = TestBed.inject(HttpTestingController);
      element.querySelector<HTMLButtonElement>('[aria-label="Abrir menú de usuario"]')!.click();
      await fixture.whenStable();
      const menu = document.body.querySelector('[role="menu"]')!;
      const logoutAction = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
        (item) => item.textContent?.includes('Cerrar sesión'),
      )!;
      expect(logoutAction.getAttribute('aria-disabled')).toBe('false');
      logoutAction.click();
      const request = http.expectOne('/api/auth/logout');
      expect(TestBed.inject(SessionStore).state()).toEqual({ status: 'logout-pending' });
      fixture.detectChanges();
      const pendingDisabled = logoutAction.getAttribute('aria-disabled');
      const pendingLabel = logoutAction.textContent;
      logoutAction.click();
      http.expectNone('/api/auth/logout');
      expect(router.url).toBe('/');

      request.flush(null, {
        status,
        statusText: status === 204 ? 'No Content' : 'Service Unavailable',
      });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(pendingDisabled).toBe('true');
      expect(pendingLabel).toContain('Cerrando sesión');
      expect(navigate).toHaveBeenCalledWith('/login', { replaceUrl: true });
      expect(router.url).toBe('/login');
      expect(TestBed.inject(SessionStore).state()).toEqual({ status: 'unauthenticated' });
      expect(element.querySelector('app-login')).not.toBeNull();
      expect(element.querySelector('app-app-shell')).toBeNull();
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(document.body.querySelector('[role="alert"]')).toBeNull();
      expect(element.textContent).not.toMatch(
        /Service Unavailable|revocaci[oó]n|cerramos la sesi[oó]n local/,
      );

      await router.navigateByUrl('/403');
      await fixture.whenStable();
      expect(router.url).toBe('/login');
      http.expectNone(() => true);
    },
  );

  it('changes only the local demonstration team and keeps team creation unavailable', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector<HTMLButtonElement>(
      '[aria-label="Seleccionar equipo de demostración"]',
    )!;
    trigger.click();
    await fixture.whenStable();
    const menu = document.body.querySelector('[role="menu"]')!;
    const actions = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(
      actions
        .find((item) => item.textContent?.includes('Añadir equipo'))
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
    actions.find((item) => item.textContent?.includes('Equipo Horizonte'))!.click();
    await fixture.whenStable();
    expect(trigger.textContent).toContain('Equipo Horizonte');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('preserves project menus while disabling every unimplemented action', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    element
      .querySelector<HTMLButtonElement>('[aria-label="Más opciones de Ingeniería de diseño"]')!
      .click();
    await fixture.whenStable();
    const menu = document.body.querySelector('[role="menu"]')!;
    for (const label of ['Ver proyecto', 'Compartir proyecto', 'Eliminar proyecto']) {
      const action = Array.from(menu.querySelectorAll('[role="menuitem"]')).find((item) =>
        item.textContent?.includes(label),
      );
      expect(action?.getAttribute('aria-disabled')).toBe('true');
    }
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('localizes mobile sidebar accessibility labels and closes the drawer', async () => {
    viewport.next({ matches: true, breakpoints: {} });
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('[data-slot="sidebar-trigger"]')!.click();
    await fixture.whenStable();
    const dialog = element.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Barra lateral');
    expect(dialog?.getAttribute('data-state')).toBe('open');
    const close = element.querySelector<HTMLButtonElement>('[data-slot="sidebar-backdrop"]')!;
    expect(close.getAttribute('aria-label')).toBe('Cerrar barra lateral');
    close.click();
    await fixture.whenStable();
    expect(dialog?.getAttribute('data-state')).toBe('closed');
  });
});
