import { BreakpointObserver } from '@angular/cdk/layout';
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@/features/auth/application/session-store';
import type { CurrentUser, SessionState } from '@/features/auth/domain/auth-models';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import type { Task, TaskListResponse } from '../../domain/task-model';
import { parseTaskQuery } from '../../domain/task-query';
import { TasksApi } from '../../infrastructure/tasks-api';
import { TaskList } from './task-list';

const initialUrl = '/tasks?status=in_progress&sort=title&page=3';
const ownTask: Task = {
  id: 'own-task-id',
  ownerId: 'example-user-id',
  title: 'Own report',
  description: 'Original description',
  status: 'in_progress',
  dueDate: null,
  createdAt: '2026-10-25T00:00:00.000Z',
  updatedAt: '2026-10-25T00:00:00.000Z',
};
const foreignTask: Task = {
  ...ownTask,
  id: 'foreign-task-id',
  ownerId: 'another-user-id',
  title: 'Another report',
};
const initialResponse: TaskListResponse = {
  data: [foreignTask, ownTask],
  meta: { page: 3, limit: 20, totalItems: 42, totalPages: 3 },
};
const refreshedResponse: TaskListResponse = {
  data: [ownTask],
  meta: { page: 3, limit: 20, totalItems: 41, totalPages: 3 },
};
const origins = ['dropdown', 'context', 'dropdown-keyboard', 'context-key', 'shift-f10'] as const;
type MenuOrigin = (typeof origins)[number];

function user(permissions: string[], role = 'Viewer'): CurrentUser {
  return {
    id: 'example-user-id',
    email: 'example@example.com',
    name: 'Example User',
    role,
    permissions,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('TaskList confirmed deletion', () => {
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let session: WritableSignal<SessionState>;
  const api = {
    list: vi.fn<() => Promise<TaskListResponse>>(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn<(id: string) => Promise<void>>(),
  };

  beforeEach(() => {
    api.list.mockReset().mockResolvedValue(initialResponse);
    api.create.mockReset();
    api.update.mockReset();
    api.remove.mockReset().mockResolvedValue(undefined);
    session = signal<SessionState>({
      status: 'authenticated',
      user: user(['tasks:read:any', 'tasks:delete:any']),
    });
    TestBed.configureTestingModule({
      providers: [
        provideZard(),
        provideRouter([{ path: 'tasks', component: TaskList }]),
        { provide: TasksApi, useValue: api },
        { provide: SessionStore, useValue: { state: session.asReadonly() } },
        {
          provide: BreakpointObserver,
          useValue: {
            observe: () => of({ matches: false, breakpoints: { '(max-width: 767.98px)': false } }),
          },
        },
      ],
    });
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
    expect(page.textContent).toContain(ownTask.title);
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

  function menuItem(menu: HTMLElement, label: string): HTMLElement | undefined {
    return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.trim() === label,
    );
  }

  async function openMenu(task: Task, origin: MenuOrigin): Promise<HTMLElement> {
    if (origin === 'dropdown' || origin === 'dropdown-keyboard') {
      const button = actionButton(task);
      expect(button).toBeDefined();
      button!.focus();
      if (origin === 'dropdown') button!.click();
      else
        button!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
        );
    } else {
      const target = row(task);
      target.focus();
      const event =
        origin === 'context'
          ? new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
          : new KeyboardEvent('keydown', {
              key: origin === 'context-key' ? 'ContextMenu' : 'F10',
              shiftKey: origin === 'shift-f10',
              bubbles: true,
              cancelable: true,
            });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    await settle();
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    await vi.waitFor(() => expect(menu!.contains(document.activeElement)).toBe(true));
    return menu!;
  }

  async function requestDelete(task = foreignTask, origin: MenuOrigin = 'dropdown') {
    const menu = await openMenu(task, origin);
    expect(menuItem(menu, 'Editar')).toBeUndefined();
    const item = menuItem(menu, 'Eliminar');
    expect(item).toBeDefined();
    if (origin === 'dropdown-keyboard' || origin === 'context-key' || origin === 'shift-f10') {
      menu.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
      await settle();
      expect(document.activeElement).toBe(item);
      menu.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    } else item!.click();
    await settle();
    await vi.waitFor(() => {
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull();
    });
    const dialog = document.body.querySelector<HTMLElement>('[role="alertdialog"]')!;
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!);
    expect(title?.textContent).toContain(task.title);
    expect(api.remove).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe(initialUrl);
    return dialog;
  }

  function dialogButton(dialog: HTMLElement, label: string): HTMLButtonElement {
    const button = Array.from(dialog.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    expect(button).toBeDefined();
    return button!;
  }

  async function waitForDialogClose() {
    await settle();
    await vi.waitFor(() => expect(document.body.querySelector('[role="alertdialog"]')).toBeNull());
  }

  function expectFeedback(role: 'status' | 'alert', text: string) {
    expect(
      Array.from(page.querySelectorAll(`[role="${role}"]`)).some((node) =>
        node.textContent?.includes(text),
      ),
    ).toBe(true);
  }

  function expectNoOtherMutation() {
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  }

  it.each(origins)(
    'confirms the selected row from %s and refreshes the same query',
    async (origin) => {
      const pending = deferred<void>();
      api.remove.mockReturnValueOnce(pending.promise);
      await render();
      const dialog = await requestDelete(foreignTask, origin);
      dialogButton(dialog, 'Eliminar').click();
      await waitForDialogClose();

      expect(api.remove).toHaveBeenCalledExactlyOnceWith(foreignTask.id);
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(row(foreignTask)).toBeDefined();
      expectFeedback('status', 'Eliminando tarea');
      api.list.mockResolvedValue(refreshedResponse);
      pending.resolve(undefined);
      await settle();
      await vi.waitFor(() => {
        harness.detectChanges();
        expect(page.textContent).not.toContain(foreignTask.title);
        expect(page.textContent).toContain(ownTask.title);
        expect(page.textContent).toMatch(/Total:\s*41/);
      });
      expect(api.list).toHaveBeenCalledTimes(2);
      expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(initialUrl.split('?')[1]));
      expect(TestBed.inject(Router).url).toBe(initialUrl);
      expectFeedback('status', 'Tarea eliminada.');
      expectNoOtherMutation();
    },
  );

  it.each(['dropdown', 'context'] as const)(
    'keeps independent edit/delete permissions in the shared %s menu',
    async (origin) => {
      session.set({
        status: 'authenticated',
        user: user(['tasks:read:any', 'tasks:update:any', 'tasks:delete:own']),
      });
      await render();
      const ownMenu = await openMenu(ownTask, origin);
      expect(menuItem(ownMenu, 'Editar')).toBeDefined();
      expect(menuItem(ownMenu, 'Eliminar')).toBeDefined();
      ownMenu.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      await settle();
      await vi.waitFor(() => expect(document.body.querySelector('[role="menu"]')).toBeNull());
      const foreignMenu = await openMenu(foreignTask, origin);
      expect(menuItem(foreignMenu, 'Editar')).toBeDefined();
      expect(menuItem(foreignMenu, 'Eliminar')).toBeUndefined();
      expect(api.remove).not.toHaveBeenCalled();
      expect(api.list).toHaveBeenCalledTimes(1);
      expectNoOtherMutation();
    },
  );

  it.each(['Viewer', 'Admin'])(
    'does not expose deletion to a read-only %s or intercept the native context menu',
    async (role) => {
      session.set({ status: 'authenticated', user: user(['tasks:read:any'], role) });
      await render();
      for (const task of [ownTask, foreignTask]) {
        expect(actionButton(task)).toBeUndefined();
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        row(task).dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
      await settle();
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
      expect(api.remove).not.toHaveBeenCalled();
      expectNoOtherMutation();
    },
  );

  it.each(['cancel', 'escape'] as const)(
    'dismisses via %s without deleting and can reopen',
    async (via) => {
      await render();
      const dialog = await requestDelete();
      if (via === 'cancel') dialogButton(dialog, 'Cancelar').click();
      else
        dialog.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
      await waitForDialogClose();
      expect(api.remove).not.toHaveBeenCalled();
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(row(foreignTask)).toBeDefined();
      await requestDelete();
      expect(document.body.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
      expectNoOtherMutation();
    },
  );

  it('ignores repeated confirmation and blocks another deletion while pending', async () => {
    const pending = deferred<void>();
    api.remove.mockReturnValueOnce(pending.promise);
    await render();
    const dialog = await requestDelete();
    const confirm = dialogButton(dialog, 'Eliminar');
    confirm.click();
    confirm.click();
    await waitForDialogClose();
    expect(api.remove).toHaveBeenCalledExactlyOnceWith(foreignTask.id);
    const nextButton = actionButton(ownTask);
    if (nextButton && !nextButton.disabled) {
      const menu = await openMenu(ownTask, 'dropdown');
      const item = menuItem(menu, 'Eliminar');
      if (item) {
        expect(item.getAttribute('aria-disabled')).toBe('true');
        item.click();
        await settle();
      }
    }
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(1);
    pending.resolve(undefined);
    await settle();
    expectNoOtherMutation();
  });

  it('retains the row on failure and retries only after a new confirmation', async () => {
    api.remove.mockRejectedValueOnce(new Error('Forbidden')).mockResolvedValueOnce(undefined);
    await render();
    const dialog = await requestDelete();
    dialogButton(dialog, 'Eliminar').click();
    await waitForDialogClose();
    expectFeedback('alert', 'No pudimos eliminar la tarea. Inténtalo de nuevo.');
    expect(row(foreignTask)).toBeDefined();
    expect(api.list).toHaveBeenCalledTimes(1);
    const retry = await openMenu(foreignTask, 'context');
    menuItem(retry, 'Eliminar')!.click();
    await settle();
    const confirmation = document.body.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(confirmation).not.toBeNull();
    expect(api.remove).toHaveBeenCalledTimes(1);
    api.list.mockResolvedValue(refreshedResponse);
    dialogButton(confirmation, 'Eliminar').click();
    await waitForDialogClose();
    expect(api.remove).toHaveBeenCalledTimes(2);
    expect(api.remove).toHaveBeenLastCalledWith(foreignTask.id);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expectFeedback('status', 'Tarea eliminada.');
    expectNoOtherMutation();
  });

  it('refreshes the current query when the URL changes during deletion', async () => {
    const pending = deferred<void>();
    api.remove.mockReturnValueOnce(pending.promise);
    await render();
    const dialog = await requestDelete();
    dialogButton(dialog, 'Eliminar').click();
    await waitForDialogClose();
    const nextUrl = '/tasks?search=report&sort=-updatedAt&page=2';
    await TestBed.inject(Router).navigateByUrl(nextUrl);
    await settle();
    expect(api.list).toHaveBeenCalledTimes(2);
    pending.resolve(undefined);
    await settle();
    expect(api.list).toHaveBeenCalledTimes(3);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(nextUrl.split('?')[1]));
    expect(TestBed.inject(Router).url).toBe(nextUrl);
    expect(api.remove).toHaveBeenCalledExactlyOnceWith(foreignTask.id);
    expectNoOtherMutation();
  });

  it.each(['menu', 'confirmation'] as const)(
    'rechecks current permissions at %s activation',
    async (stage) => {
      await render();
      const target =
        stage === 'menu'
          ? menuItem(await openMenu(foreignTask, 'dropdown'), 'Eliminar')!
          : dialogButton(await requestDelete(), 'Eliminar');
      expect(target).toBeDefined();
      session.set({ status: 'authenticated', user: user(['tasks:read:any']) });
      target.click();
      await settle();
      if (stage === 'confirmation') await waitForDialogClose();
      expect(api.remove).not.toHaveBeenCalled();
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
      expectNoOtherMutation();
    },
  );

  it('closes an unconfirmed dialog when its owner is destroyed without deleting', async () => {
    await render();
    await requestDelete();
    harness.fixture.destroy();
    await vi.waitFor(() => expect(document.body.querySelector('[role="alertdialog"]')).toBeNull());
    expect(api.remove).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledTimes(1);
    expectNoOtherMutation();
  });

  it('does not refresh after a confirmed deletion completes beyond destruction', async () => {
    const pending = deferred<void>();
    api.remove.mockReturnValueOnce(pending.promise);
    await render();
    const dialog = await requestDelete();
    dialogButton(dialog, 'Eliminar').click();
    await waitForDialogClose();
    harness.fixture.destroy();
    pending.resolve(undefined);
    await pending.promise;
    await Promise.resolve();
    expect(api.remove).toHaveBeenCalledExactlyOnceWith(foreignTask.id);
    expect(api.list).toHaveBeenCalledTimes(1);
    expectNoOtherMutation();
  });
});
