import { BreakpointObserver } from '@angular/cdk/layout';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedApiClient } from '@/core/http/authenticated-api-client';
import { SessionStore } from '@/features/auth/application/session-store';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import { TasksApi } from '../../infrastructure/tasks-api';
import type { Task } from '../../domain/task-model';
import { TaskList } from './task-list';

// S1/S2/S3/S4: real transport/session, Router and installed menus/dialog; no live backend.
describe('T5 independent public seams', () => {
  let http: HttpTestingController;
  let session: SessionStore;
  let harness: RouterTestingHarness;
  let tasks: Task[];
  let bytes: string;
  let initialHash: string;
  const id = '11111111-1111-4111-8111-111111111111';
  const initialUrl = '/tasks?status=in_progress&sort=title&page=2&limit=10';
  const initialApi = '/api/tasks?status=in_progress&sort=title&page=2&limit=10';
  const defaults = ['tasks:read:any', 'tasks:delete:any'];
  function hash(text: string): string {
    let value = 2166136261;
    for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return (value >>> 0).toString(16).padStart(8, '0');
  }
  function unchanged() {
    expect(JSON.stringify(tasks)).toBe(bytes);
    expect(hash(JSON.stringify(tasks))).toBe(initialHash);
  }
  beforeEach(() => {
    tasks = [
      {
        id,
        ownerId: 'user-one',
        title: '<img src=x onerror=alert(1)> & report',
        description: null,
        status: 'in_progress',
        dueDate: null,
        createdAt: '2026-10-25T00:00:00Z',
        updatedAt: '2026-10-25T00:00:00Z',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        ownerId: 'foreign-user',
        title: 'Foreign report',
        description: null,
        status: 'in_progress',
        dueDate: null,
        createdAt: '2026-10-25T00:00:00Z',
        updatedAt: '2026-10-25T00:00:00Z',
      },
    ];
    bytes = JSON.stringify(tasks);
    initialHash = hash(bytes);
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
  afterEach(() => {
    unchanged();
    http.verify();
  });
  async function login(permissions = defaults, role = 'Viewer', token = 'first-token') {
    const promise = session.login({ email: 'example@example.com', password: 'test-password-only' });
    http.expectOne('/api/auth/login').flush({
      data: {
        accessToken: token,
        currentUser: {
          id: 'user-one',
          email: 'example@example.com',
          name: 'Example',
          role,
          permissions,
        },
      },
    });
    await promise;
  }
  async function settle() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  function response(data = tasks, totalItems = 12, totalPages = 2) {
    return { data, meta: { page: 2, limit: 10, totalItems, totalPages } };
  }
  async function render(permissions = defaults, role = 'Viewer') {
    await login(permissions, role);
    harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl(initialUrl, TaskList);
    await vi.waitFor(() => http.expectOne(initialApi).flush(response()));
    await navigation;
    await settle();
  }
  function row(index = 0) {
    return Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLTableRowElement>('tbody tr'),
    ).find((node) => node.querySelector('td')?.textContent?.trim() === tasks[index].title)!;
  }
  async function menu(index = 0, context = false) {
    if (context)
      row(index).dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }),
      );
    else row(index).querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    await settle();
    const result = document.body.querySelector<HTMLElement>('[role="menu"]')!;
    expect(result).not.toBeNull();
    return result;
  }
  function item(label: string, root: ParentNode = document.body) {
    return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (node) => node.textContent?.trim() === label,
    )!;
  }
  function button(label: string, root: ParentNode = document.body) {
    return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (node) => node.textContent?.trim() === label,
    )!;
  }
  async function confirm(index = 0, context = false) {
    item('Eliminar', await menu(index, context)).click();
    await settle();
    const dialog = document.body.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(dialog).not.toBeNull();
    expect(
      document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent?.trim(),
    ).toBe(`¿Eliminar "${tasks[index].title}"?`);
    expect(dialog.querySelector('img')).toBeNull();
    http.expectNone((req) => req.method !== 'GET');
    unchanged();
    return dialog;
  }
  function startDelete(dialog: HTMLElement, index = 0) {
    const ok = button('Eliminar', dialog);
    ok.click();
    ok.click();
    harness.detectChanges();
    const request = http.expectOne(`/api/tasks/${tasks[index].id}`);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('Authorization')).toBe('Bearer first-token');
    return request;
  }
  function text() {
    return harness.routeNativeElement!.textContent!;
  }

  it('CONTROL S2/S3: previous GET/POST/PATCH bodies, errors, logout and stale-session rejection stay exact', async () => {
    const client = TestBed.inject(AuthenticatedApiClient);
    await expect(client.get('/tasks')).rejects.toThrow('An authenticated session is required');
    http.expectNone(() => true);
    unchanged();
    await login();
    for (const verb of ['get', 'post', 'patch'] as const) {
      const body = { title: 'Report', description: null };
      const call = verb === 'get' ? client.get('/tasks') : client[verb]('/tasks', body);
      const request = http.expectOne('/api/tasks');
      expect(request.request.method).toBe(verb.toUpperCase());
      expect(request.request.body).toBe(verb === 'get' ? null : body);
      expect(request.request.headers.get('Authorization')).toBe('Bearer first-token');
      expect(request.request.withCredentials).toBe(true);
      request.flush(response());
      expect(await call).toEqual(response());
      await expect(
        verb === 'get'
          ? client.get('//example.com/tasks')
          : client[verb]('//example.com/tasks', body),
      ).rejects.toThrow('Only API-relative paths are allowed');
      http.expectNone(() => true);
      unchanged();
    }
    const failed = client.patch('/tasks/id', { description: null }).catch((error) => error);
    http
      .expectOne('/api/tasks/id')
      .flush({ message: 'Denied' }, { status: 403, statusText: 'Forbidden' });
    const error = await failed;
    if (!(error instanceof HttpErrorResponse)) throw new Error('Expected HTTP failure');
    expect(error.message).toBe('Http failure response for /api/tasks/id: 403 Forbidden');
    expect(error.error).toEqual({ message: 'Denied' });
    expect(error.status).toBe(403);
    unchanged();
    const stale = client.get('/tasks').catch((error) => error);
    const pending = http.expectOne('/api/tasks');
    const logout = session.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await logout;
    await login(defaults, 'Viewer', 'replacement-token');
    pending.flush(response());
    const staleError = await stale;
    if (!(staleError instanceof Error)) throw new Error('Expected stale-session failure');
    expect(staleError.message).toBe('Session changed during the request');
    http.expectNone(() => true);
    unchanged();
  });

  it('CONTROL S2/S3: existing create/edit entries preserve query and exact form data without mutation', async () => {
    await render(['tasks:read:any', 'tasks:create:own', 'tasks:update:own']);
    const before = text();
    expect(before).toContain('Total: 12');
    const editMenu = await menu();
    expect(item('Editar', editMenu)).toBeDefined();
    item('Editar', editMenu).click();
    await settle();
    let panel = document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    expect(panel.querySelector<HTMLInputElement>('#task-title')!.value).toBe(tasks[0].title);
    expect(button('Guardar cambios', panel)).toBeDefined();
    panel.querySelector<HTMLButtonElement>('[data-slot="sheet-close"]')!.click();
    await settle();
    await vi.waitFor(() =>
      expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull(),
    );
    button('Crear tarea', harness.routeNativeElement!).click();
    await settle();
    panel = document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    expect(panel.querySelector<HTMLInputElement>('#task-title')!.value).toBe('');
    expect(button('Crear tarea', panel)).toBeDefined();
    expect(TestBed.inject(Router).url).toBe(initialUrl);
    http.expectNone(() => true);
    unchanged();
  });

  it('S2/S3: bodyless adapter 204, exact 404, invalid paths and anonymous rejection do not mutate fixtures', async () => {
    const client = TestBed.inject(AuthenticatedApiClient);
    for (const path of [
      '',
      'tasks/id',
      '//example.com/tasks',
      'https://example.com/tasks',
      '/tasks\\id',
    ]) {
      await expect(client.delete(path)).rejects.toThrow('Only API-relative paths are allowed');
      http.expectNone(() => true);
      unchanged();
    }
    await expect(client.delete('/tasks/id')).rejects.toThrow(
      'An authenticated session is required',
    );
    http.expectNone(() => true);
    unchanged();
    await login();
    const api = TestBed.inject(TasksApi);
    const success = api.remove(id);
    const request = http.expectOne(`/api/tasks/${id}`);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.get('Authorization')).toBe('Bearer first-token');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(await success).toBeNull();
    http.expectNone(() => true);
    unchanged();
    const failed = api.remove(id).catch((error) => error);
    http
      .expectOne(`/api/tasks/${id}`)
      .flush({ message: 'Task not found' }, { status: 404, statusText: 'Not Found' });
    const error = await failed;
    expect(error.status).toBe(404);
    expect(error.error).toEqual({ message: 'Task not found' });
    expect(error.message).toBe(`Http failure response for /api/tasks/${id}: 404 Not Found`);
    http.expectNone(() => true);
    unchanged();
  });

  it('S3: any permission deletes foreign data only after accept, closes pending, and newest-query empty last page wins', async () => {
    await render();
    const dialog = await confirm(1, true);
    const request = startDelete(dialog, 1);
    await vi.waitFor(() => expect(document.body.querySelector('[role="alertdialog"]')).toBeNull());
    expect(row(1)).toBeDefined();
    expect(text()).toContain('Eliminando tarea...');
    expect(row(0).querySelector('button[aria-haspopup="menu"]')).toBeNull();
    http.expectNone(() => true);
    unchanged();
    const next = '/tasks?search=next&sort=-updatedAt&page=3&limit=10';
    await TestBed.inject(Router).navigateByUrl(next);
    await settle();
    const oldGet = http.expectOne('/api/tasks?search=next&sort=-updatedAt&page=3&limit=10');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() =>
      http
        .expectOne('/api/tasks?search=next&sort=-updatedAt&page=3&limit=10')
        .flush({ data: [], meta: { page: 3, limit: 10, totalItems: 20, totalPages: 2 } }),
    );
    await settle();
    oldGet.flush(response());
    await settle();
    expect(text()).toContain('Tarea eliminada.');
    expect(text()).not.toContain(tasks[1].title);
    expect(harness.routeNativeElement!.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(TestBed.inject(Router).url).toBe(next);
    http.expectNone(() => true);
    unchanged();
  });

  it('S3: cancel/Escape/403 keep fixture bytes and row; retry requires new confirmation', async () => {
    await render();
    for (const escape of [false, true]) {
      const dialog = await confirm();
      if (escape)
        dialog.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
      else button('Cancelar', dialog).click();
      await vi.waitFor(() =>
        expect(document.body.querySelector('[role="alertdialog"]')).toBeNull(),
      );
      http.expectNone(() => true);
      expect(row()).toBeDefined();
      unchanged();
    }
    const request = startDelete(await confirm());
    request.flush(
      { message: 'Insufficient permissions' },
      { status: 403, statusText: 'Forbidden' },
    );
    await settle();
    await vi.waitFor(() => expect(document.body.querySelector('[role="alertdialog"]')).toBeNull());
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos eliminar la tarea. Inténtalo de nuevo.',
    );
    expect(row()).toBeDefined();
    expect(TestBed.inject(Router).url).toBe(initialUrl);
    http.expectNone(() => true);
    unchanged();
    const retryDialog = await confirm(0, true);
    http.expectNone(() => true);
    const retry = startDelete(retryDialog);
    retry.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() => http.expectOne(initialApi).flush(response([tasks[1]], 11)));
    await settle();
    expect(text()).toContain('Tarea eliminada.');
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')).toBeNull();
    unchanged();
  });

  it('S2/S3: own/role policy and both invocation-time session rechecks make no DELETE', async () => {
    await render(['tasks:read:any', 'tasks:delete:own']);
    expect(row(1).querySelector('button[aria-haspopup="menu"]')).toBeNull();
    const native = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    row(1).dispatchEvent(native);
    expect(native.defaultPrevented).toBe(false);
    http.expectNone(() => true);
    unchanged();
    const staleItem = item('Eliminar', await menu(0, true));
    await login(['tasks:read:any'], 'Admin', 'denied-token');
    staleItem.click();
    await settle();
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
    http.expectNone(() => true);
    unchanged();
    // Dispose the old menu through the public keyboard path before restoring permissions.
    document.body
      .querySelector('[role="menu"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => expect(document.body.querySelector('[role="menu"]')).toBeNull());
    await login(['tasks:read:any', 'tasks:delete:own']);
    await settle();
    const dialog = await confirm();
    await login(['tasks:read:any'], 'Admin', 'denied-token');
    button('Eliminar', dialog).click();
    await settle();
    await vi.waitFor(() => expect(document.body.querySelector('[role="alertdialog"]')).toBeNull());
    expect(row().querySelector('button[aria-haspopup="menu"]')).toBeNull();
    expect(text()).not.toContain('Tarea eliminada.');
    http.expectNone(() => true);
    unchanged();
  });

  it.each([204, 403])(
    'S2/S3: replaced same-user session suppresses late DELETE %s and clears busy for fresh confirmation',
    async (status) => {
      await render();
      const request = startDelete(await confirm());
      await vi.waitFor(() =>
        expect(document.body.querySelector('[role="alertdialog"]')).toBeNull(),
      );
      const logout = session.logout();
      http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
      await logout;
      await login(defaults, 'Viewer', 'replacement-token');
      await settle();
      const snapshot = JSON.stringify(session.state());
      request.flush(status === 204 ? null : { message: 'Denied' }, {
        status,
        statusText: status === 204 ? 'No Content' : 'Forbidden',
      });
      await settle();
      await vi.waitFor(() => {
        harness.detectChanges();
        expect(text()).not.toContain('Eliminando tarea...');
      });
      expect(JSON.stringify(session.state())).toBe(snapshot);
      expect(text()).not.toContain('Tarea eliminada.');
      expect(text()).not.toContain('No pudimos eliminar');
      expect(text()).not.toContain('Eliminando tarea...');
      expect(row()).toBeDefined();
      http.expectNone(() => true);
      unchanged();
      const fresh = await confirm();
      button('Cancelar', fresh).click();
      await settle();
      http.expectNone(() => true);
      unchanged();
    },
  );

  it.each([204, 403])('S3: teardown prevents late DELETE %s feedback/reload', async (status) => {
    await render();
    const request = startDelete(await confirm());
    harness.fixture.destroy();
    request.flush(status === 204 ? null : { message: 'Denied' }, {
      status,
      statusText: status === 204 ? 'No Content' : 'Forbidden',
    });
    // Drain the actual request promise and overlay disposal without invoking any component handler.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await vi.waitFor(() => expect(document.body.querySelector('[role="alertdialog"]')).toBeNull());
    http.expectNone(() => true);
    unchanged();
  });
});
