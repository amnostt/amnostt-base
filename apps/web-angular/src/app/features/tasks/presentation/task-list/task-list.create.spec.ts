import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@/features/auth/application/session-store';
import type { CurrentUser, SessionState } from '@/features/auth/domain/auth-models';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import type { Task, TaskListResponse } from '../../domain/task-model';
import { parseTaskQuery } from '../../domain/task-query';
import { TasksApi } from '../../infrastructure/tasks-api';
import { TaskList } from './task-list';

const initialUrl = '/tasks?status=in_progress&page=3';
const mobileQuery = '(max-width: 767.98px)';

const created: Task = {
  id: 'created-task-id',
  ownerId: 'example-user-id',
  title: 'New report',
  description: null,
  status: 'pending',
  dueDate: null,
  createdAt: '2026-10-21T12:00:00.000Z',
  updatedAt: '2026-10-21T12:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function user(permissions: string[], role = 'Viewer'): CurrentUser {
  return {
    id: 'example-user-id',
    email: 'example@example.com',
    name: 'Example User',
    role,
    permissions,
  };
}

describe('TaskList creation entry and responsive Sheet', () => {
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let session: WritableSignal<SessionState>;
  let breakpoint: BehaviorSubject<BreakpointState>;
  const api = { list: vi.fn<() => Promise<TaskListResponse>>(), create: vi.fn() };
  const observer = { observe: vi.fn() };

  beforeEach(() => {
    api.list.mockReset().mockResolvedValue({
      data: [],
      meta: { page: 3, limit: 20, totalItems: 0, totalPages: 0 },
    });
    api.create.mockReset();
    session = signal<SessionState>({
      status: 'authenticated',
      user: user(['tasks:read:own', 'tasks:create:own']),
    });
    breakpoint = new BehaviorSubject<BreakpointState>({
      matches: false,
      breakpoints: { [mobileQuery]: false },
    });
    observer.observe.mockReset().mockReturnValue(breakpoint.asObservable());
    TestBed.configureTestingModule({
      providers: [
        provideZard(),
        provideRouter([{ path: 'tasks', component: TaskList }]),
        { provide: TasksApi, useValue: api },
        { provide: SessionStore, useValue: { state: session.asReadonly() } },
        { provide: BreakpointObserver, useValue: observer },
      ],
    });
  });

  async function render(url = initialUrl) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, TaskList);
    await settle();
    page = harness.routeNativeElement!;
  }

  async function settle() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function createEntry(): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll<HTMLButtonElement>('button[type="button"]')).find(
      (button) => button.textContent?.trim() === 'Crear tarea',
    );
  }

  function sheet(): HTMLElement {
    const panel = document.body.querySelector<HTMLElement>(
      '[data-slot="sheet-content"][role="dialog"]',
    );
    expect(panel).not.toBeNull();
    return panel!;
  }

  async function openSheet() {
    const button = createEntry();
    expect(button).toBeDefined();
    button!.click();
    await settle();
    await vi.waitFor(() => expect(sheet().getAttribute('data-state')).toBe('open'));
  }

  async function enterCreationTitle(value: string) {
    const input = sheet().querySelector<HTMLInputElement>('#task-title');
    expect(input).not.toBeNull();
    input!.value = value;
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  function submitCreation() {
    const form = sheet().querySelector('form');
    expect(form).not.toBeNull();
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    harness.detectChanges();
  }

  async function expectSheetClosed() {
    await vi.waitFor(() =>
      expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull(),
    );
  }

  function changeViewport(matches: boolean) {
    breakpoint.next({ matches, breakpoints: { [mobileQuery]: matches } });
  }

  const closeRoutes = ['corner', 'escape', 'backdrop'] as const;

  async function requestClose(route: (typeof closeRoutes)[number]) {
    if (route === 'escape') {
      sheet().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    } else {
      const target =
        route === 'corner'
          ? sheet().querySelector<HTMLButtonElement>('[data-slot="sheet-close"]')
          : document.body.querySelector<HTMLElement>('.cdk-overlay-backdrop');
      expect(target).not.toBeNull();
      target!.click();
    }
    await settle();
  }

  function confirmation(): HTMLElement | null {
    return document.body.querySelector('[role="alertdialog"]');
  }

  async function expectConfirmation() {
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(confirmation()?.getAttribute('data-state')).toBe('open');
    });
    const dialog = confirmation()!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    for (const attribute of ['aria-labelledby', 'aria-describedby']) {
      const id = dialog.getAttribute(attribute);
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)?.textContent?.trim()).toBeTruthy();
    }
    return dialog;
  }

  async function chooseConfirmation(dialog: HTMLElement, label: string) {
    const button = Array.from(dialog.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    expect(button).toBeDefined();
    button!.click();
    await settle();
    await vi.waitFor(() => expect(confirmation()).toBeNull());
  }

  it.each(closeRoutes)(
    'closes a clean form through %s without confirmation or requests',
    async (route) => {
      await render();
      await openSheet();
      await requestClose(route);

      expect(confirmation()).toBeNull();
      await expectSheetClosed();
      expect(api.create).not.toHaveBeenCalled();
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(Router).url).toBe(initialUrl);
    },
  );

  it.each(closeRoutes)(
    'confirms dirty %s closure and keeps the same draft on cancel',
    async (route) => {
      await render();
      await openSheet();
      await enterCreationTitle('Unfinished report');
      const form = sheet().querySelector('app-task-form');
      const title = sheet().querySelector<HTMLInputElement>('#task-title');
      await requestClose(route);

      const dialog = await expectConfirmation();
      expect(sheet().getAttribute('data-state')).toBe('open');
      expect(sheet().querySelector('app-task-form')).toBe(form);
      await chooseConfirmation(dialog, 'Seguir editando');

      expect(sheet().getAttribute('data-state')).toBe('open');
      expect(sheet().querySelector('app-task-form')).toBe(form);
      expect(sheet().querySelector('#task-title')).toBe(title);
      expect(title?.value).toBe('Unfinished report');
      expect(api.create).not.toHaveBeenCalled();
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(Router).url).toBe(initialUrl);
    },
  );

  it.each(closeRoutes)(
    'discards dirty %s closure without saving or refreshing and reopens empty',
    async (route) => {
      await render();
      await openSheet();
      await enterCreationTitle('Discard this draft');
      await requestClose(route);
      const dialog = await expectConfirmation();
      await chooseConfirmation(dialog, 'Descartar');
      await expectSheetClosed();

      await openSheet();
      expect(sheet().querySelector<HTMLInputElement>('#task-title')?.value).toBe('');
      expect(sheet().querySelector<HTMLTextAreaElement>('#task-description')?.value).toBe('');
      expect(api.create).not.toHaveBeenCalled();
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(Router).url).toBe(initialUrl);
    },
  );

  it.each(closeRoutes)(
    'blocks %s closure while saving, then closes on success without confirmation',
    async (route) => {
      const pending = deferred<Task>();
      api.create.mockReturnValue(pending.promise);
      await render();
      await openSheet();
      await enterCreationTitle('New report');
      const form = sheet().querySelector('app-task-form');
      submitCreation();
      await settle();

      try {
        await requestClose(route);
        expect(confirmation()).toBeNull();
        expect(sheet().getAttribute('data-state')).toBe('open');
        expect(sheet().querySelector('app-task-form')).toBe(form);
        expect(sheet().querySelector<HTMLInputElement>('#task-title')?.value).toBe('New report');
        expect(sheet().querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
          true,
        );
        expect(api.create).toHaveBeenCalledExactlyOnceWith({
          title: 'New report',
          status: 'pending',
        });
        expect(api.list).toHaveBeenCalledTimes(1);
        expect(TestBed.inject(Router).url).toBe(initialUrl);
      } finally {
        pending.resolve(created);
        await settle();
      }

      await expectSheetClosed();
      expect(confirmation()).toBeNull();
      expect(api.create).toHaveBeenCalledTimes(1);
      expect(api.list).toHaveBeenCalledTimes(2);
      expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(initialUrl.split('?')[1]));
      expect(TestBed.inject(Router).url).toBe(initialUrl);
    },
  );

  it.each(['tasks:create:own', 'tasks:create:any'])(
    'opens one labelled Sheet and the existing form with %s without creating or navigating',
    async (permission) => {
      session.set({ status: 'authenticated', user: user(['tasks:read:own', permission]) });
      await render();
      expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull();
      await openSheet();

      const panel = sheet();
      const titleId = panel.getAttribute('aria-labelledby');
      expect(titleId).toBeTruthy();
      expect(document.getElementById(titleId!)?.textContent?.trim()).toBe('Crear tarea');
      expect(panel.getAttribute('aria-modal')).toBe('true');
      expect(panel.getAttribute('data-side')).toBe('right');
      expect(panel.querySelector('app-task-form #task-title')).not.toBeNull();
      expect(panel.querySelector('app-task-form textarea#task-description')).not.toBeNull();
      expect(document.body.querySelectorAll('app-task-form')).toHaveLength(1);
      expect(TestBed.inject(Router).url).toBe(initialUrl);
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(api.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    { role: 'Viewer', permissions: ['tasks:read:own'] },
    { role: 'Admin', permissions: ['tasks:read:any'] },
  ])(
    'hides creation from a read-only $role without trusting the role name',
    async ({ role, permissions }) => {
      session.set({ status: 'authenticated', user: user(permissions, role) });
      await render();
      expect(createEntry()).toBeUndefined();
      expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull();
      expect(api.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: 'bootstrap-loading' },
    { status: 'unauthenticated' },
    { status: 'logout-pending' },
  ] as const)('does not offer creation while the session is $status', async (state) => {
    session.set(state);
    await render();
    expect(createEntry()).toBeUndefined();
    expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('opens the same creation form from the bottom on mobile', async () => {
    changeViewport(true);
    await render();
    await openSheet();
    expect(sheet().getAttribute('data-side')).toBe('bottom');
    expect(sheet().querySelector('app-task-form #task-title')).not.toBeNull();
    expect(document.body.querySelectorAll('app-task-form')).toHaveLength(1);
    expect(TestBed.inject(Router).url).toBe(initialUrl);
    expect(api.create).not.toHaveBeenCalled();
  });

  it('retains one form and its draft when placement changes between desktop and mobile', async () => {
    await render();
    await openSheet();
    const panel = sheet();
    const title = panel.querySelector<HTMLInputElement>('#task-title')!;
    const description = panel.querySelector<HTMLTextAreaElement>('#task-description')!;
    title.value = 'Unfinished report';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    description.value = 'Keep this draft';
    description.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    for (const mobile of [true, false]) {
      changeViewport(mobile);
      await settle();
      expect(sheet()).toBe(panel);
      expect(sheet().getAttribute('data-side')).toBe(mobile ? 'bottom' : 'right');
      expect(sheet().querySelector('#task-title')).toBe(title);
      expect(title.value).toBe('Unfinished report');
      expect(description.value).toBe('Keep this draft');
      expect(document.body.querySelectorAll('app-task-form')).toHaveLength(1);
    }
    expect(TestBed.inject(Router).url).toBe(initialUrl);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.create).not.toHaveBeenCalled();
  });

  it('closes after saving, refreshes the current query and reopens with an empty form', async () => {
    const existing = { ...created, id: 'existing-task-id', title: 'Existing report' };
    const url = '/tasks?search=report&status=pending&sort=title&page=3';
    const query = parseTaskQuery(url.split('?')[1]);
    api.list
      .mockResolvedValueOnce({
        data: [existing],
        meta: { page: 3, limit: 20, totalItems: 41, totalPages: 3 },
      })
      .mockResolvedValueOnce({
        data: [existing, created],
        meta: { page: 3, limit: 20, totalItems: 42, totalPages: 3 },
      });
    api.create.mockResolvedValue(created);
    await render(url);
    await openSheet();
    await enterCreationTitle('New report');
    submitCreation();
    await settle();

    expect(api.create).toHaveBeenCalledExactlyOnceWith({ title: 'New report', status: 'pending' });
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenNthCalledWith(1, query);
    expect(api.list).toHaveBeenNthCalledWith(2, query);
    expect(TestBed.inject(Router).url).toBe(url);
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(page.textContent).toContain('Existing report');
      expect(page.textContent).toContain('New report');
      expect(page.textContent).toContain('Total: 42');
    });
    await expectSheetClosed();

    await openSheet();
    expect(sheet().querySelector<HTMLInputElement>('#task-title')?.value).toBe('');
    expect(sheet().querySelector<HTMLTextAreaElement>('#task-description')?.value).toBe('');
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(TestBed.inject(Router).url).toBe(url);
  });

  it('keeps the Sheet open while saving and refreshes only after the single pending create succeeds', async () => {
    const pending = deferred<Task>();
    api.create.mockReturnValue(pending.promise);
    await render();
    await openSheet();
    await enterCreationTitle('New report');
    submitCreation();
    await settle();
    submitCreation();

    expect(sheet().getAttribute('data-state')).toBe('open');
    expect(sheet().querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(api.create).toHaveBeenCalledExactlyOnceWith({ title: 'New report', status: 'pending' });
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe(initialUrl);

    pending.resolve(created);
    await settle();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(initialUrl.split('?')[1]));
    await expectSheetClosed();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe(initialUrl);
  });

  it('retains the failed creation draft without reloading and closes only after a successful retry', async () => {
    api.create
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(created);
    await render();
    await openSheet();
    await enterCreationTitle('New report');
    submitCreation();
    await settle();

    expect(sheet().getAttribute('data-state')).toBe('open');
    expect(sheet().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos crear la tarea. Inténtalo de nuevo.',
    );
    expect(sheet().querySelector<HTMLInputElement>('#task-title')?.value).toBe('New report');
    expect(sheet().querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe(initialUrl);

    submitCreation();
    await settle();
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(api.create).toHaveBeenLastCalledWith({ title: 'New report', status: 'pending' });
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(initialUrl.split('?')[1]));
    await expectSheetClosed();
    expect(TestBed.inject(Router).url).toBe(initialUrl);
  });

  it('closes cleanly when edited values return to their defaults', async () => {
    await render();
    await openSheet();
    await enterCreationTitle('Temporary');
    await enterCreationTitle('');
    await requestClose('corner');

    expect(confirmation()).toBeNull();
    await expectSheetClosed();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('confirms description-only changes and preserves the same draft on cancel', async () => {
    await render();
    await openSheet();
    const input = sheet().querySelector<HTMLTextAreaElement>('#task-description')!;
    input.value = 'Only description\n  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await requestClose('escape');
    await chooseConfirmation(await expectConfirmation(), 'Seguir editando');

    expect(sheet().querySelector('#task-description')).toBe(input);
    expect(input.value).toBe('Only description\n  ');
    expect(api.create).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('withdraws an open creation form when create permission is removed', async () => {
    await render();
    await openSheet();
    await enterCreationTitle('Do not submit');
    session.set({ status: 'authenticated', user: user(['tasks:read:own'], 'Admin') });
    await settle();
    await expectSheetClosed();

    expect(createEntry()).toBeUndefined();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('refreshes the latest query after saving and ignores an obsolete list response', async () => {
    const save = deferred<Task>();
    const obsolete = deferred<TaskListResponse>();
    api.create.mockReturnValue(save.promise);
    await render();
    await openSheet();
    await enterCreationTitle('New report');
    submitCreation();
    api.list.mockReturnValueOnce(obsolete.promise);
    const url = '/tasks?search=new&status=pending&page=2&limit=10';
    await harness.navigateByUrl(url, TaskList);
    await settle();
    api.list.mockResolvedValueOnce({
      data: [created],
      meta: { page: 2, limit: 10, totalItems: 11, totalPages: 2 },
    });
    save.resolve(created);
    await settle();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(page.textContent).toContain('New report');
    });
    await expectSheetClosed();

    expect(api.create).toHaveBeenCalledExactlyOnceWith({ title: 'New report', status: 'pending' });
    expect(api.list).toHaveBeenCalledTimes(3);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(url.split('?')[1]));
    obsolete.resolve({
      data: [],
      meta: { page: 2, limit: 10, totalItems: 0, totalPages: 0 },
    });
    await settle();
    expect(page.textContent).toContain('New report');
    expect(page.textContent).toContain('Total: 11');
    expect(TestBed.inject(Router).url).toBe(url);
  });
});
