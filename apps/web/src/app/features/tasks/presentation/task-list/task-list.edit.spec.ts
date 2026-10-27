import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@/features/auth/application/session-store';
import type { CurrentUser, SessionState } from '@/features/auth/domain/auth-models';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import type { Task, TaskListResponse } from '../../domain/task-model';
import { parseTaskQuery } from '../../domain/task-query';
import { TasksApi } from '../../infrastructure/tasks-api';
import { TaskList } from './task-list';

const initialUrl = '/tasks?status=in_progress&page=3';
const mobileQuery = '(max-width: 767.98px)';
const ownTask: Task = {
  id: 'own-task-id',
  ownerId: 'example-user-id',
  title: 'Own report',
  description: 'Original own description',
  status: 'in_progress',
  dueDate: '2026-10-26',
  createdAt: '2026-10-22T12:00:00.000Z',
  updatedAt: '2026-10-22T12:00:00.000Z',
};
const foreignTask: Task = {
  ...ownTask,
  id: 'foreign-task-id',
  ownerId: 'another-user-id',
  title: 'Another report',
  description: 'Original foreign description',
};
const initialResponse: TaskListResponse = {
  data: [ownTask, foreignTask],
  meta: { page: 3, limit: 20, totalItems: 42, totalPages: 3 },
};
const origins = ['dropdown', 'dropdown-keyboard', 'context', 'context-key', 'shift-f10'] as const;
type MenuOrigin = (typeof origins)[number];

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

describe('TaskList shared edit entry', () => {
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let session: WritableSignal<SessionState>;
  let breakpoint: BehaviorSubject<BreakpointState>;
  const api = { list: vi.fn<() => Promise<TaskListResponse>>(), create: vi.fn(), update: vi.fn() };
  const observer = { observe: vi.fn() };

  beforeEach(() => {
    // jsdom has no layout; CDK's real focus trap needs geometry to find visible controls.
    // Scope simulated layout to the Sheet, preserving the real focus behavior and assertions.
    const getClientRects = HTMLElement.prototype.getClientRects;
    const rect = new DOMRect(0, 0, 100, 30);
    const visibleRects = {
      0: rect,
      length: 1,
      item: (index: number) => (index === 0 ? rect : null),
      [Symbol.iterator]: () => [rect].values(),
    };
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (
        this.closest('[data-slot="sheet-content"]') &&
        !this.closest('[hidden]') &&
        getComputedStyle(this).display !== 'none'
      ) {
        return visibleRects;
      }
      return getClientRects.call(this);
    });

    api.list.mockReset().mockResolvedValue(initialResponse);
    api.create.mockReset();
    api.update.mockReset();
    session = signal<SessionState>({
      status: 'authenticated',
      user: user(['tasks:read:any', 'tasks:update:any']),
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function settle() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  async function render() {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(initialUrl, TaskList);
    await settle();
    page = harness.routeNativeElement!;
    expect(
      Array.from(page.querySelectorAll('thead th')).map((head) => head.textContent?.trim()),
    ).toContain('Acciones');
  }

  function row(task: Task): HTMLTableRowElement {
    const target = Array.from(page.querySelectorAll<HTMLTableRowElement>('tbody tr')).find(
      (candidate) => candidate.querySelector('td')?.textContent?.trim() === task.title,
    );
    expect(target).toBeDefined();
    return target!;
  }

  function actionButton(task: Task): HTMLButtonElement | undefined {
    return Array.from(row(task).querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.getAttribute('aria-label') === `Acciones de ${task.title}`,
    );
  }

  async function openMenu(task: Task, origin: MenuOrigin): Promise<HTMLElement> {
    if (origin === 'dropdown' || origin === 'dropdown-keyboard') {
      const button = actionButton(task);
      expect(button).toBeDefined();
      expect(button!.getAttribute('aria-haspopup')).toBe('menu');
      button!.focus();
      if (origin === 'dropdown') button!.click();
      else
        button!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
        );
    } else {
      const target = row(task);
      if (origin === 'context') {
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 80,
          button: 2,
        });
        target.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      } else {
        expect(target.tabIndex).toBe(0);
        target.focus();
        target.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: origin === 'context-key' ? 'ContextMenu' : 'F10',
            shiftKey: origin === 'shift-f10',
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    }
    await settle();
    await vi.waitFor(() => {
      const menus = document.body.querySelectorAll<HTMLElement>('[role="menu"]');
      expect(menus).toHaveLength(1);
      const menu = menus[0];
      expect(menu.contains(document.activeElement)).toBe(true);
    });
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')!;
    expect(
      Array.from(menu.querySelectorAll('[role="menuitem"]')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['Editar']);
    return menu;
  }

  async function selectEdit(menu: HTMLElement, keyboard = false) {
    if (keyboard) {
      menu.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
      await settle();
      menu.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    } else {
      menu.querySelector<HTMLElement>('[role="menuitem"]')!.click();
    }
    await settle();
    await vi.waitFor(() => {
      const panel = document.body.querySelector<HTMLElement>(
        '[data-slot="sheet-content"][role="dialog"]',
      );
      expect(panel?.getAttribute('data-state')).toBe('open');
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(
        panel!.contains(document.activeElement),
        `Focus owner: ${document.activeElement?.tagName}`,
      ).toBe(true);
    });
    return document.body.querySelector<HTMLElement>('[data-slot="sheet-content"][role="dialog"]')!;
  }

  function expectNoMutationOrNavigation() {
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledExactlyOnceWith(parseTaskQuery(initialUrl.split('?')[1]));
    expect(TestBed.inject(Router).url).toBe(initialUrl);
  }

  function sheet(): HTMLElement {
    const panel = document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]');
    expect(panel).not.toBeNull();
    return panel!;
  }

  async function enterTitle(panel: HTMLElement, value: string) {
    const input = panel.querySelector<HTMLInputElement>('#task-title')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  function submit(panel: HTMLElement) {
    panel
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    harness.detectChanges();
  }

  async function expectClosed() {
    await vi.waitFor(() =>
      expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull(),
    );
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

  async function chooseConfirmation(label: string) {
    await vi.waitFor(() =>
      expect(document.body.querySelector('[role="alertdialog"]')?.getAttribute('data-state')).toBe(
        'open',
      ),
    );
    const dialog = document.body.querySelector('[role="alertdialog"]')!;
    const button = Array.from(dialog.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    expect(button).toBeDefined();
    button!.click();
    await settle();
    await vi.waitFor(() => expect(document.body.querySelector('[role="alertdialog"]')).toBeNull());
  }

  describe('saving and guarded closure', () => {
    it.each(['dropdown', 'context'] as const)(
      'saves through %s, refreshes the current query and reopens with updated values',
      async (origin) => {
        const updated = { ...foreignTask, title: 'Revised report' };
        api.update.mockResolvedValue(updated);
        api.list
          .mockResolvedValueOnce(initialResponse)
          .mockResolvedValueOnce({ ...initialResponse, data: [ownTask, updated] });
        await render();
        const panel = await selectEdit(await openMenu(foreignTask, origin));
        await enterTitle(panel, updated.title);
        submit(panel);
        await settle();
        await expectClosed();

        expect(api.update).toHaveBeenCalledExactlyOnceWith(foreignTask.id, {
          title: updated.title,
          description: foreignTask.description,
          status: foreignTask.status,
          dueDate: foreignTask.dueDate,
        });
        expect(api.create).not.toHaveBeenCalled();
        expect(api.list).toHaveBeenCalledTimes(2);
        expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(initialUrl.split('?')[1]));
        expect(TestBed.inject(Router).url).toBe(initialUrl);
        expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
        await vi.waitFor(() => {
          harness.detectChanges();
          expect(row(updated).textContent).toContain(updated.title);
        });
        const reopened = await selectEdit(await openMenu(updated, origin));
        expect(reopened.querySelector<HTMLInputElement>('#task-title')?.value).toBe(updated.title);
        expect(api.list).toHaveBeenCalledTimes(2);
        expect(api.update).toHaveBeenCalledTimes(1);
      },
    );

    it('refreshes the query current when a pending edit finishes rather than the opening query', async () => {
      const pending = deferred<Task>();
      const updated = { ...foreignTask, title: 'Revised report' };
      const nextUrl = '/tasks?search=Revised';
      api.update.mockReturnValue(pending.promise);
      api.list
        .mockResolvedValueOnce(initialResponse)
        .mockResolvedValueOnce({
          data: [],
          meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
        })
        .mockResolvedValueOnce({
          data: [updated],
          meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
        });
      await render();
      const panel = await selectEdit(await openMenu(foreignTask, 'context'));
      const form = panel.querySelector('app-task-form');
      await enterTitle(panel, updated.title);
      submit(panel);
      await settle();

      try {
        await harness.navigateByUrl(nextUrl, TaskList);
        await settle();
        expect(sheet().querySelector('app-task-form')).toBe(form);
        expect(panel.querySelector<HTMLInputElement>('#task-title')?.value).toBe(updated.title);
        expect(api.list).toHaveBeenCalledTimes(2);
        pending.resolve(updated);
        await settle();
        await expectClosed();
        await vi.waitFor(() => {
          harness.detectChanges();
          expect(row(updated).textContent).toContain(updated.title);
        });
        expect(api.list).toHaveBeenCalledTimes(3);
        expect(api.list).toHaveBeenNthCalledWith(2, parseTaskQuery('search=Revised'));
        expect(api.list).toHaveBeenNthCalledWith(3, parseTaskQuery('search=Revised'));
        expect(api.update).toHaveBeenCalledTimes(1);
        expect(api.create).not.toHaveBeenCalled();
        expect(TestBed.inject(Router).url).toBe(nextUrl);
      } finally {
        pending.resolve(updated);
        await settle();
      }
    });

    it('keeps a rejected edit and original row intact, then closes and refreshes on retry', async () => {
      const updated = { ...foreignTask, title: 'Retry draft' };
      api.update
        .mockRejectedValueOnce(new Error('Network unavailable'))
        .mockResolvedValueOnce(updated);
      api.list
        .mockResolvedValueOnce(initialResponse)
        .mockResolvedValueOnce({ ...initialResponse, data: [ownTask, updated] });
      await render();
      const panel = await selectEdit(await openMenu(foreignTask, 'dropdown'));
      const form = panel.querySelector('app-task-form');
      await enterTitle(panel, updated.title);
      submit(panel);
      await settle();

      expect(sheet().querySelector('app-task-form')).toBe(form);
      expect(panel.querySelector<HTMLInputElement>('#task-title')?.value).toBe(updated.title);
      expect(panel.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'No pudimos actualizar la tarea. Inténtalo de nuevo.',
      );
      expect(row(foreignTask).querySelector('td')?.textContent?.trim()).toBe(foreignTask.title);
      expect(foreignTask.title).toBe('Another report');
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(api.create).not.toHaveBeenCalled();
      expect(TestBed.inject(Router).url).toBe(initialUrl);
      submit(panel);
      await settle();
      await expectClosed();

      expect(api.update).toHaveBeenCalledTimes(2);
      for (const call of [1, 2]) {
        expect(api.update).toHaveBeenNthCalledWith(call, foreignTask.id, {
          title: updated.title,
          description: foreignTask.description,
          status: foreignTask.status,
          dueDate: foreignTask.dueDate,
        });
      }
      expect(api.list).toHaveBeenCalledTimes(2);
      expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(initialUrl.split('?')[1]));
      expect(api.create).not.toHaveBeenCalled();
    });

    it.each(['escape', 'backdrop'] as const)(
      'closes an unchanged existing task through %s without confirmation or requests',
      async (route) => {
        await render();
        await selectEdit(await openMenu(foreignTask, 'context'));
        await requestClose(route);
        await expectClosed();
        expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
        expectNoMutationOrNavigation();
      },
    );

    it.each(closeRoutes)('keeps the same edit draft after cancelling %s closure', async (route) => {
      await render();
      const panel = await selectEdit(await openMenu(foreignTask, 'context'));
      const form = panel.querySelector('app-task-form');
      await enterTitle(panel, 'Unfinished edit');
      await requestClose(route);
      await chooseConfirmation('Seguir editando');

      expect(sheet().querySelector('app-task-form')).toBe(form);
      expect(panel.querySelector<HTMLInputElement>('#task-title')?.value).toBe('Unfinished edit');
      expect(panel.querySelector<HTMLTextAreaElement>('#task-description')?.value).toBe(
        foreignTask.description,
      );
      expectNoMutationOrNavigation();
    });

    it.each(closeRoutes)(
      'discards %s edits without updating and reopens the original task',
      async (route) => {
        await render();
        const panel = await selectEdit(await openMenu(foreignTask, 'dropdown'));
        await enterTitle(panel, 'Discard this edit');
        await requestClose(route);
        await chooseConfirmation('Descartar');
        await expectClosed();
        expectNoMutationOrNavigation();

        const reopened = await selectEdit(await openMenu(foreignTask, 'context'));
        expect(reopened.querySelector<HTMLInputElement>('#task-title')?.value).toBe(
          foreignTask.title,
        );
        await requestClose('corner');
        await expectClosed();
        expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
        expectNoMutationOrNavigation();
      },
    );

    it.each(closeRoutes)(
      'blocks %s closure and duplicate submits while an edit is saving',
      async (route) => {
        const pending = deferred<Task>();
        const updated = { ...foreignTask, title: 'Pending edit' };
        api.update.mockReturnValue(pending.promise);
        api.list
          .mockResolvedValueOnce(initialResponse)
          .mockResolvedValueOnce({ ...initialResponse, data: [ownTask, updated] });
        await render();
        const panel = await selectEdit(await openMenu(foreignTask, 'dropdown'));
        const form = panel.querySelector('app-task-form');
        await enterTitle(panel, updated.title);
        submit(panel);
        await settle();

        try {
          await requestClose(route);
          expect(sheet().getAttribute('data-state')).toBe('open');
          expect(sheet().querySelector('app-task-form')).toBe(form);
          expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
          expect(panel.querySelector<HTMLInputElement>('#task-title')?.value).toBe(updated.title);
          expect(panel.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
            true,
          );
          submit(panel);
          await settle();
          expect(api.update).toHaveBeenCalledExactlyOnceWith(foreignTask.id, {
            title: updated.title,
            description: foreignTask.description,
            status: foreignTask.status,
            dueDate: foreignTask.dueDate,
          });
          expect(api.create).not.toHaveBeenCalled();
          expect(api.list).toHaveBeenCalledTimes(1);
          expect(TestBed.inject(Router).url).toBe(initialUrl);
        } finally {
          pending.resolve(updated);
          await settle();
        }

        await expectClosed();
        expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
        expect(api.update).toHaveBeenCalledTimes(1);
        expect(api.list).toHaveBeenCalledTimes(2);
        expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(initialUrl.split('?')[1]));
        expect(TestBed.inject(Router).url).toBe(initialUrl);
      },
    );
  });

  it.each(origins)(
    'opens the selected row in the reused editor through %s without create permission',
    async (origin) => {
      await render();
      const menu = await openMenu(foreignTask, origin);
      const panel = await selectEdit(menu, origin !== 'dropdown' && origin !== 'context');

      expect(document.body.querySelectorAll('[data-slot="sheet-content"]')).toHaveLength(1);
      expect(panel.querySelectorAll('app-task-form')).toHaveLength(1);
      expect(
        document.getElementById(panel.getAttribute('aria-labelledby')!)?.textContent?.trim(),
      ).toBe('Editar tarea');
      expect(panel.querySelector<HTMLInputElement>('#task-title')?.value).toBe(foreignTask.title);
      expect(panel.querySelector<HTMLTextAreaElement>('#task-description')?.value).toBe(
        foreignTask.description,
      );
      expect(panel.querySelector('button[type="submit"]')?.textContent?.trim()).toBe(
        'Guardar cambios',
      );
      expect(panel.getAttribute('data-side')).toBe('right');
      expectNoMutationOrNavigation();
    },
  );

  it('offers update:own only on the owned row and preserves the browser context menu for another owner', async () => {
    session.set({ status: 'authenticated', user: user(['tasks:read:any', 'tasks:update:own']) });
    await render();
    expect(actionButton(foreignTask)).toBeUndefined();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    row(foreignTask).dispatchEvent(event);
    await settle();
    expect(event.defaultPrevented).toBe(false);
    expect(document.body.querySelector('[role="menu"]')).toBeNull();

    const panel = await selectEdit(await openMenu(ownTask, 'context'));
    expect(panel.querySelector<HTMLInputElement>('#task-title')?.value).toBe(ownTask.title);
    expectNoMutationOrNavigation();
  });

  it('rechecks update permission before opening an already rendered menu item', async () => {
    await render();
    const item = (await openMenu(foreignTask, 'dropdown')).querySelector<HTMLElement>(
      '[role="menuitem"]',
    )!;
    session.set({ status: 'authenticated', user: user(['tasks:read:any']) });
    item.click();
    await settle();

    expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull();
    expectNoMutationOrNavigation();
  });

  it('closes an open editor when update permission is withdrawn', async () => {
    await render();
    await selectEdit(await openMenu(foreignTask, 'dropdown'));
    session.set({ status: 'authenticated', user: user(['tasks:read:any']) });
    await settle();

    await expectClosed();
    expectNoMutationOrNavigation();
  });

  it.each(['Viewer', 'Admin'])('offers no edit menu for a read-only %s', async (role) => {
    session.set({ status: 'authenticated', user: user(['tasks:read:any'], role) });
    await render();
    for (const task of [ownTask, foreignTask]) {
      expect(actionButton(task)).toBeUndefined();
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      row(task).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    await settle();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull();
    expectNoMutationOrNavigation();
  });

  it.each(['bootstrap-loading', 'unauthenticated', 'logout-pending'] as const)(
    'offers no edit menu while the session is %s',
    async (status) => {
      session.set({ status });
      await render();
      expect(actionButton(ownTask)).toBeUndefined();
      expect(actionButton(foreignTask)).toBeUndefined();
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      row(ownTask).dispatchEvent(event);
      await settle();
      expect(event.defaultPrevented).toBe(false);
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull();
      expectNoMutationOrNavigation();
    },
  );

  it('keeps the same editing form and draft when the Sheet changes from right to bottom', async () => {
    await render();
    const panel = await selectEdit(await openMenu(ownTask, 'dropdown'));
    const form = panel.querySelector('app-task-form');
    const title = panel.querySelector<HTMLInputElement>('#task-title')!;
    title.value = 'Unfinished edit';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    breakpoint.next({ matches: true, breakpoints: { [mobileQuery]: true } });
    await settle();

    expect(panel.getAttribute('data-side')).toBe('bottom');
    expect(panel.querySelector('app-task-form')).toBe(form);
    expect(panel.querySelector('#task-title')).toBe(title);
    expect(title.value).toBe('Unfinished edit');
    expectNoMutationOrNavigation();
  });

  it('opens creation with fresh defaults after closing a clean editor without saving or refreshing', async () => {
    session.set({
      status: 'authenticated',
      user: user(['tasks:read:any', 'tasks:update:any', 'tasks:create:own']),
    });
    await render();
    const panel = await selectEdit(await openMenu(foreignTask, 'context'));
    panel.querySelector<HTMLButtonElement>('[data-slot="sheet-close"]')!.click();
    await settle();
    await vi.waitFor(() =>
      expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull(),
    );
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
    const create = Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Crear tarea',
    );
    expect(create).toBeDefined();
    create!.click();
    await settle();
    const createdPanel = document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
    expect(createdPanel.querySelectorAll('app-task-form')).toHaveLength(1);
    expect(createdPanel.querySelector<HTMLInputElement>('#task-title')?.value).toBe('');
    expect(createdPanel.querySelector<HTMLTextAreaElement>('#task-description')?.value).toBe('');
    expect(
      createdPanel.querySelector('z-select button[role="combobox"]')?.textContent?.trim(),
    ).toBe('Pendiente');
    expect(createdPanel.querySelector('button[type="submit"]')?.textContent?.trim()).toBe(
      'Crear tarea',
    );
    expectNoMutationOrNavigation();
  });
});
