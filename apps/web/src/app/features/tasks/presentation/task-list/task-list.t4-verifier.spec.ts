import { BreakpointObserver } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@/features/auth/application/session-store';
import { AuthenticatedApiClient } from '@/core/http/authenticated-api-client';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import type { Task } from '../../domain/task-model';
import { TasksApi } from '../../infrastructure/tasks-api';
import { TaskList } from './task-list';

// S1/S2 preserved; S3 update transport, owner/session gating and current-query ordering; S4 composition.
describe('T4 independent public HTTP regression probes', () => {
  let http: HttpTestingController;
  let session: SessionStore;
  let harness: RouterTestingHarness;
  let tasks: Task[];
  let original: string;
  const url = '/tasks?status=in_progress&page=2';
  const owner = 'user-one';
  const permissions = ['tasks:read:any', 'tasks:update:own'];
  const fixture = (): Task => ({
    id: '11111111-1111-4111-8111-111111111111',
    ownerId: owner,
    title: 'Original report',
    description: 'Keep until explicitly cleared',
    status: 'in_progress',
    dueDate: '2024-02-29',
    createdAt: '2026-10-22T12:00:00Z',
    updatedAt: '2026-10-22T12:00:00Z',
  });
  // Byte equality plus a deterministic FNV-1a hash detects accidental mutation of response fixtures.
  function hash(text: string) {
    let value = 2166136261;
    for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
    return (value >>> 0).toString(16).padStart(8, '0');
  }
  function unchanged() {
    expect(JSON.stringify(tasks)).toBe(original);
    expect(hash(JSON.stringify(tasks))).toBe(hash(original));
  }
  beforeEach(() => {
    tasks = [
      fixture(),
      {
        ...fixture(),
        id: '22222222-2222-4222-8222-222222222222',
        ownerId: 'someone-else',
        title: 'Foreign report',
      },
    ];
    original = JSON.stringify(tasks);
    // jsdom lacks geometry; keep the actual Sheet/CDK focus trap and its public focus assertions.
    const nativeRects = HTMLElement.prototype.getClientRects;
    const rect = new DOMRect(0, 0, 100, 30);
    const rects = {
      0: rect,
      length: 1,
      item: (i: number) => (i === 0 ? rect : null),
      [Symbol.iterator]: () => [rect].values(),
    };
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.closest('[data-slot="sheet-content"]') &&
        !this.closest('[hidden]') &&
        getComputedStyle(this).display !== 'none'
        ? rects
        : nativeRects.call(this);
    });
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
    vi.restoreAllMocks();
  });
  async function login(perms = permissions, token = 'original-token') {
    const result = session.login({ email: 'example@example.com', password: 'test-password-only' });
    http.expectOne('/api/auth/login').flush({
      data: {
        accessToken: token,
        currentUser: {
          id: owner,
          email: 'example@example.com',
          name: 'Example',
          role: 'Viewer',
          permissions: perms,
        },
      },
    });
    await result;
  }
  async function settle() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  function response(data = tasks) {
    return { data, meta: { page: 2, limit: 20, totalItems: 21, totalPages: 2 } };
  }
  async function render() {
    await login();
    harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl(url, TaskList);
    await vi.waitFor(() =>
      http.expectOne('/api/tasks?status=in_progress&page=2').flush(response()),
    );
    await navigation;
    await settle();
  }
  function panel() {
    return document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]');
  }
  function row(title = tasks[0].title) {
    return Array.from(harness.routeNativeElement!.querySelectorAll<HTMLElement>('tbody tr')).find(
      (item) => item.querySelector('td')?.textContent?.trim() === title,
    )!;
  }
  async function menu(context = false) {
    if (context)
      row().dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 100,
          clientY: 80,
        }),
      );
    else row().querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    await settle();
    const item = document.body.querySelector<HTMLElement>('[role="menuitem"]');
    expect(item?.textContent?.trim()).toBe('Editar');
    return item!;
  }
  async function edit(context = false) {
    (await menu(context)).click();
    await settle();
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(panel()!.contains(document.activeElement)).toBe(true);
    });
    expect(panel()!.querySelector<HTMLInputElement>('#task-title')!.value).toBe(tasks[0].title);
    http.expectNone(() => true); // no detail GET for the row snapshot
  }
  async function input(selector: string, value: string) {
    const control = panel()!.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }
  function submit() {
    panel()!
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    harness.detectChanges();
  }
  function button(label: string, root: ParentNode = document.body) {
    return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (item) => item.textContent?.trim() === label,
    )!;
  }
  async function closed() {
    await vi.waitFor(() => expect(panel()).toBeNull());
  }

  it('S3: explicit null PATCH survives rejection/retry, duplicates and out-of-order current-query refresh', async () => {
    await render();
    await edit(true);
    await input('#task-title', '  Updated report  ');
    await input('#task-description', '');
    button('Limpiar vencimiento', panel()!).click();
    await settle();
    submit();
    submit();
    const first = http.expectOne(`/api/tasks/${tasks[0].id}`);
    expect(first.request.method).toBe('PATCH');
    expect(first.request.headers.get('Authorization')).toBe('Bearer original-token');
    expect(first.request.withCredentials).toBe(true);
    expect(first.request.body).toEqual({
      title: 'Updated report',
      status: 'in_progress',
      description: null,
      dueDate: null,
    });
    http.expectNone(() => true);
    first.flush({ message: 'Validation failed' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    await vi.waitFor(() =>
      expect(panel()!.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'No pudimos actualizar la tarea. Inténtalo de nuevo.',
      ),
    );
    unchanged();
    http.expectNone(() => true);
    expect(panel()!.querySelector<HTMLInputElement>('#task-title')!.value).toBe(
      '  Updated report  ',
    );
    submit();
    const retry = http.expectOne(`/api/tasks/${tasks[0].id}`);
    expect(retry.request.body).toEqual(first.request.body);
    await TestBed.inject(Router).navigateByUrl('/tasks?status=completed&sort=title');
    await settle();
    const older = http.expectOne('/api/tasks?status=completed&sort=title');
    const saved: Task = { ...tasks[0], ...first.request.body, updatedAt: '2026-10-23T00:00:00Z' };
    retry.flush(saved);
    await vi.waitFor(() =>
      http
        .expectOne('/api/tasks?status=completed&sort=title')
        .flush({ data: [saved], meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 } }),
    );
    await settle();
    await closed();
    older.flush(response());
    await settle();
    expect(harness.routeNativeElement!.textContent).toContain('Updated report');
    expect(harness.routeNativeElement!.textContent).toContain('Total: 1');
    expect(harness.routeNativeElement!.textContent).not.toContain('Foreign report');
    expect(TestBed.inject(Router).url).toBe('/tasks?status=completed&sort=title');
    http.expectNone(() => true);
    unchanged();
  });

  it('S3: denied foreign row keeps native context behavior and makes no request', async () => {
    await render();
    const foreign = row('Foreign report');
    expect(foreign.querySelector('button[aria-haspopup="menu"]')).toBeNull();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    foreign.dispatchEvent(event);
    await settle();
    expect(event.defaultPrevented).toBe(false);
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(panel()).toBeNull();
    http.expectNone(() => true);
    unchanged();
  });

  it.each([false, true])(
    'S2/S3: current-session gate rejects a previously rendered menu item (context=%s)',
    async (context) => {
      await render();
      const staleItem = await menu(context);
      await login(['tasks:read:any'], 'replacement-token');
      // Click the actual still-rendered item before requesting another rendering turn.
      staleItem.click();
      await settle();
      expect(panel()).toBeNull();
      http.expectNone(() => true);
      unchanged();
    },
  );

  it('S2/S3: permission withdrawal removes an open editor without a mutation', async () => {
    await render();
    await edit();
    await input('#task-title', 'Unsaved');
    await login(['tasks:read:any'], 'replacement-token');
    await settle();
    await closed();
    expect(row().querySelector('button[aria-haspopup="menu"]')).toBeNull();
    http.expectNone(() => true);
    unchanged();
  });

  it('S2/S3: late PATCH after logout and same-user login cannot publish or refresh', async () => {
    await render();
    await edit();
    await input('#task-title', 'Late update');
    submit();
    const patch = http.expectOne(`/api/tasks/${tasks[0].id}`);
    const logout = session.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await logout;
    await settle();
    await closed();
    await login(permissions, 'replacement-token');
    await settle();
    const before = JSON.stringify(session.state());
    // Existing creation behavior can remount an editor at login; the stale response must not change it.
    const panelBeforeResponse = panel();
    patch.flush({ ...tasks[0], title: 'Late update' });
    await settle();
    expect(JSON.stringify(session.state())).toBe(before);
    expect(panel()).toBe(panelBeforeResponse);
    expect(harness.routeNativeElement!.textContent).not.toContain('Late update');
    http.expectNone(() => true);
    unchanged();
  });

  it('S3: invalid edit, canceled discard and confirmed discard never request PATCH or reload', async () => {
    await render();
    await edit();
    await input('#task-title', ' '.repeat(3));
    submit();
    await settle();
    expect(panel()!.textContent).toContain('Ingresa un título.');
    http.expectNone(() => true);
    unchanged();
    await input('#task-title', 'x'.repeat(121));
    submit();
    await settle();
    expect(panel()!.textContent).toContain('El título debe tener como máximo 120 caracteres.');
    http.expectNone(() => true);
    unchanged();
    await input('#task-title', 'Valid');
    await input('#task-description', 'x'.repeat(2001));
    submit();
    await settle();
    expect(panel()!.textContent).toContain(
      'La descripción debe tener como máximo 2000 caracteres.',
    );
    http.expectNone(() => true);
    unchanged();
    panel()!.querySelector<HTMLButtonElement>('[data-slot="sheet-close"]')!.click();
    await settle();
    button('Seguir editando').click();
    await settle();
    expect(panel()!.querySelector<HTMLTextAreaElement>('#task-description')!.value).toHaveLength(
      2001,
    );
    http.expectNone(() => true);
    unchanged();
    panel()!.querySelector<HTMLButtonElement>('[data-slot="sheet-close"]')!.click();
    await settle();
    button('Descartar').click();
    await settle();
    await closed();
    http.expectNone(() => true);
    unchanged();
  });

  it('S2/S3: partial update preserves omission, resource identity and exact HTTP failure', async () => {
    await login();
    const api = TestBed.inject(TasksApi);
    const body = { description: null };
    const bytes = JSON.stringify(body);
    const result = api.update(tasks[0].id, body);
    const request = http.expectOne(`/api/tasks/${tasks[0].id}`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toBe(body);
    const saved = { ...tasks[0], description: null };
    request.flush(saved);
    expect(await result).toBe(saved);
    expect(JSON.stringify(body)).toBe(bytes);
    const failure = api.update(tasks[0].id, { dueDate: null });
    const caught = failure.catch((error) => error);
    http
      .expectOne(`/api/tasks/${tasks[0].id}`)
      .flush({ message: 'Task not found' }, { status: 404, statusText: 'Not Found' });
    const error = await caught;
    expect(error.status).toBe(404);
    expect(error.error).toEqual({ message: 'Task not found' });
    expect(error.message).toBe(
      `Http failure response for /api/tasks/${tasks[0].id}: 404 Not Found`,
    );
    http.expectNone(() => true);
    unchanged();
  });

  it('S2/S3: rejected PATCH paths and anonymous sessions preserve bodies and exact errors', async () => {
    const client = TestBed.inject(AuthenticatedApiClient);
    const body = { title: 'Valid', description: null };
    const bytes = JSON.stringify(body);
    for (const path of [
      'https://example.com/tasks',
      '//example.com/tasks',
      'tasks',
      '/tasks\\escape',
    ]) {
      await expect(client.patch(path, body)).rejects.toThrow('Only API-relative paths are allowed');
      expect(JSON.stringify(body)).toBe(bytes);
      http.expectNone(() => true);
      unchanged();
    }
    await expect(client.patch('/tasks/id', body)).rejects.toThrow(
      'An authenticated session is required',
    );
    expect(JSON.stringify(body)).toBe(bytes);
    http.expectNone(() => true);
    unchanged();
  });
});
