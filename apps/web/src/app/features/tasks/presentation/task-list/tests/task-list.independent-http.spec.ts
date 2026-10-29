import { BreakpointObserver } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@/features/auth/application/session-store';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import { TaskList } from '../task-list';

describe('TaskList HTTP and session integration', () => {
  let http: HttpTestingController;
  let session: SessionStore;
  let harness: RouterTestingHarness;
  const url = '/tasks?search=report&status=pending&page=2';
  const user = {
    id: 'user-id',
    email: 'test@example.com',
    name: 'Test',
    role: 'Viewer',
    permissions: ['tasks:read:own', 'tasks:create:own', 'tasks:update:own', 'tasks:delete:own'],
  };
  const created = {
    id: 'new-id',
    ownerId: user.id,
    title: 'Report',
    description: null,
    status: 'pending',
    dueDate: null,
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
  };
  const empty = { data: [], meta: { page: 2, limit: 20, totalItems: 0, totalPages: 0 } };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZard(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'tasks', component: TaskList }]),
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: false, breakpoints: {} }) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
  });

  afterEach(() => http.verify());

  async function login(token = 'token-one') {
    const promise = session.login({ email: user.email, password: 'example-only-password' });
    http.expectOne('/api/auth/login').flush({ data: { accessToken: token, currentUser: user } });
    await promise;
  }

  async function settle() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function panel() {
    return document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]');
  }

  async function render(tasks: (typeof created)[] = []) {
    await login();
    harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl(url, TaskList);
    await vi.waitFor(() =>
      http.expectOne('/api/tasks?search=report&status=pending&page=2').flush({
        ...empty,
        data: tasks,
        meta: {
          ...empty.meta,
          totalItems: tasks.length ? 21 : 0,
          totalPages: tasks.length ? 2 : 0,
        },
      }),
    );
    await navigation;
    await settle();
  }

  async function openCreate() {
    const button = Array.from(harness.routeNativeElement!.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Crear tarea',
    )!;
    button.click();
    await settle();
    const input = panel()!.querySelector<HTMLInputElement>('#task-title')!;
    input.value = '  Report  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function openTaskAction(label: 'Editar' | 'Eliminar') {
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>(
        `button[aria-label="Acciones de ${created.title}"]`,
      )!
      .click();
    await settle();
    const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (element) => element.textContent?.trim() === label,
    );
    expect(item).toBeDefined();
    item!.click();
    await settle();
  }

  function submit() {
    panel()!
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    harness.detectChanges();
  }

  async function replaceSession() {
    const logout = session.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await logout;
    await settle();
    await login('replacement-token');
    await settle();
  }

  it('sends one authenticated POST, retains a rejected draft, retries and refreshes once', async () => {
    await render();
    await openCreate();
    const input = panel()!.querySelector<HTMLInputElement>('#task-title');
    submit();
    submit();
    const first = http.expectOne('/api/tasks');
    expect(first.request.method).toBe('POST');
    expect(first.request.headers.get('Authorization')).toBe('Bearer token-one');
    expect(first.request.withCredentials).toBe(true);
    expect(first.request.body).toEqual({ title: 'Report', status: 'pending' });
    http.expectNone(() => true);
    const before = JSON.stringify(session.state());
    first.flush({ message: 'Validation failed' }, { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(JSON.stringify(session.state())).toBe(before);
    expect(panel()!.querySelector('#task-title')).toBe(input);
    expect(input?.value).toBe('  Report  ');
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(panel()!.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'No pudimos crear la tarea. Inténtalo de nuevo.',
      );
    });
    http.expectNone(() => true);
    submit();
    const retry = http.expectOne('/api/tasks');
    expect(retry.request.body).toEqual(first.request.body);
    retry.flush(created);
    await vi.waitFor(() =>
      http.expectOne('/api/tasks?search=report&status=pending&page=2').flush({
        data: [created],
        meta: { page: 2, limit: 20, totalItems: 21, totalPages: 2 },
      }),
    );
    await settle();
    await vi.waitFor(() => expect(panel()).toBeNull());
    expect(harness.routeNativeElement!.textContent).toContain('Report');
    expect(harness.routeNativeElement!.textContent).toContain('Total: 21');
    expect(TestBed.inject(Router).url).toBe(url);
    http.expectNone(() => true);
  });

  it('does not publish or refresh an obsolete POST after logout and same-user login', async () => {
    await render();
    await openCreate();
    submit();
    const post = http.expectOne('/api/tasks');
    const logout = session.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await logout;
    await settle();
    await vi.waitFor(() => expect(panel()).toBeNull());
    await login('replacement-token');
    await settle();
    const before = JSON.stringify(session.state());
    post.flush(created);
    await settle();

    expect(JSON.stringify(session.state())).toBe(before);
    http.expectNone(() => true);
    expect(harness.routeNativeElement!.textContent).not.toContain('Total: 21');
    expect(TestBed.inject(Router).url).toBe(url);
  });

  it('does not publish or refresh an obsolete PATCH after the session changes', async () => {
    await render([created]);
    await openTaskAction('Editar');
    const input = panel()!.querySelector<HTMLInputElement>('#task-title')!;
    input.value = 'Updated report';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    submit();

    const patch = http.expectOne(`/api/tasks/${created.id}`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.headers.get('Authorization')).toBe('Bearer token-one');
    expect(patch.request.body).toEqual({
      title: 'Updated report',
      status: 'pending',
      description: null,
      dueDate: null,
    });
    await replaceSession();

    patch.flush({ ...created, title: 'Updated report' });
    await settle();
    http.expectNone(() => true);
    expect(harness.routeNativeElement!.textContent).not.toContain('Updated report');
    expect(TestBed.inject(Router).url).toBe(url);
  });

  it('does not publish or refresh an obsolete DELETE after the session changes', async () => {
    await render([created]);
    await openTaskAction('Eliminar');
    const dialog = document.body.querySelector<HTMLElement>('[role="alertdialog"]')!;
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Eliminar',
    );
    expect(confirm).toBeDefined();
    confirm!.click();
    const deletion = http.expectOne(`/api/tasks/${created.id}`);
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.body).toBeNull();
    expect(deletion.request.headers.get('Authorization')).toBe('Bearer token-one');

    await replaceSession();
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    http.expectNone(() => true);
    expect(harness.routeNativeElement!.textContent).toContain(created.title);
    expect(harness.routeNativeElement!.textContent).not.toContain('Tarea eliminada.');
    expect(TestBed.inject(Router).url).toBe(url);
  });
});
