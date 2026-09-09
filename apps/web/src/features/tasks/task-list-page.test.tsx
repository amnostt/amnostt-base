import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../auth/components/session-provider';
import { createSessionStore } from '../auth/store/session-store';
import type { AuthRepository } from '../auth/domain/auth-repository';
import { TaskListPage } from './task-list-page';

const user = {
  id: 'member-id',
  email: 'member@example.com',
  name: 'Member User',
  role: 'Member',
  permissions: ['tasks:read:own', 'tasks:update:own', 'tasks:delete:own'],
};

function renderPage(
  requestResponse: <T>(path: string, init?: RequestInit) => Promise<T>,
  request: <T>(path: string, init?: RequestInit) => Promise<T> = vi.fn(),
  initialEntry = '/',
) {
  const auth: AuthRepository = {
    login: vi.fn(),
    register: vi.fn(),
    restore: vi
      .fn()
      .mockResolvedValue({ accessToken: 'token', currentUser: user }),
    refresh: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
  };
  const store = createSessionStore(auth, request, requestResponse);
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SessionProvider store={store}>
        <TaskListPage />
      </SessionProvider>
    </MemoryRouter>,
  );
  void store.getState().bootstrap();
  return store;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TaskListPage', () => {
  it('shows a table skeleton while the collection request is pending', async () => {
    const requestResponse = vi.fn(() => new Promise<unknown>(() => {}));
    renderPage(
      requestResponse as unknown as <T>(
        path: string,
        init?: RequestInit,
      ) => Promise<T>,
    );

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Loading tasks'),
    );
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('distinguishes an empty collection from an empty filtered result', async () => {
    const requestResponse = vi.fn().mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
    });
    renderPage(requestResponse);

    await waitFor(() =>
      expect(screen.getByText('No tasks yet.')).toBeInTheDocument(),
    );
    expect(
      screen.queryByText('No tasks match your criteria.'),
    ).not.toBeInTheDocument();
  });

  it('explains when an active filter has no matching tasks and offers to clear it', async () => {
    const requestResponse = vi.fn().mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
    });
    renderPage(requestResponse, vi.fn(), '/tasks?status=completed');

    await waitFor(() =>
      expect(
        screen.getByText('No tasks match your criteria.'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: 'Clear criteria' }),
    ).toHaveAttribute('href', '/tasks');
  });

  it('shows a general error and retries the same collection request', async () => {
    const requestResponse = vi
      .fn()
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce({
        data: [
          {
            id: 'task-1',
            ownerId: 'member-id',
            title: 'Report',
            description: null,
            status: 'pending',
            dueDate: null,
            createdAt: '2026-09-06T00:00:00.000Z',
            updatedAt: '2026-09-06T00:00:00.000Z',
          },
        ],
        meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
      });
    renderPage(requestResponse);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Unable to load tasks',
      ),
    );
    await screen
      .findByRole('button', { name: 'Retry' })
      .then((button) => button.click());
    await waitFor(() => expect(screen.getByText('Report')).toBeInTheDocument());
    expect(requestResponse).toHaveBeenCalledTimes(2);
  });

  it('shows permitted row actions in an accessible overflow menu and preserves query state', async () => {
    const ownTask = {
      id: 'own-task',
      ownerId: 'member-id',
      title: 'Own task',
      description: null,
      status: 'pending',
      dueDate: null,
      createdAt: '2024-09-06T00:00:00.000Z',
      updatedAt: '2024-09-06T00:00:00.000Z',
    };
    const foreignTask = {
      id: 'foreign-task',
      ownerId: 'other-id',
      title: 'Foreign task',
      description: null,
      status: 'pending',
      dueDate: null,
      createdAt: '2024-09-06T00:00:00.000Z',
      updatedAt: '2024-09-06T00:00:00.000Z',
    };
    const requestResponse = vi.fn().mockResolvedValue({
      data: [ownTask, foreignTask],
      meta: { page: 1, limit: 20, totalItems: 2, totalPages: 1 },
    });
    renderPage(requestResponse, vi.fn(), '/tasks?search=report&page=2');

    const menuButton = await screen.findByRole('button', {
      name: 'More actions for Own task',
    });
    expect(
      screen.queryByRole('link', { name: 'Edit task' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete task' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More actions for Foreign task' }),
    ).not.toBeInTheDocument();

    await userEvent.setup().click(menuButton);

    const menu = screen.getByRole('menu', { name: 'Actions for Own task' });
    expect(screen.getByRole('menuitem', { name: 'Edit task' })).toHaveAttribute(
      'href',
      '/tasks/own-task/edit?search=report&page=2',
    );
    expect(menu).toHaveTextContent('Delete task');
  });

  it('confirms permanent deletion and prevents duplicate submissions', async () => {
    const task = {
      id: 'own-task',
      ownerId: 'member-id',
      title: 'Disposable task',
      description: null,
      status: 'pending',
      dueDate: null,
      createdAt: '2024-09-06T00:00:00.000Z',
      updatedAt: '2024-09-06T00:00:00.000Z',
    };
    const request = vi.fn(() => new Promise<never>(() => {}));
    const requestResponse = vi.fn().mockResolvedValue({
      data: [task],
      meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });
    renderPage(requestResponse, request);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: 'More actions for Disposable task',
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete task' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Delete task "Disposable task" permanently?',
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'This action cannot be undone.',
    );

    const confirm = screen.getByRole('button', {
      name: 'Delete task permanently',
    });
    await user.click(confirm);
    expect(request).toHaveBeenCalledWith('/tasks/own-task', {
      headers: { Authorization: 'Bearer token' },
      method: 'DELETE',
    });
    expect(confirm).toBeDisabled();

    await user.click(confirm);
    expect(request).toHaveBeenCalledOnce();
  });
  it('debounces search requests, aborts superseded requests, and keeps the latest result', async () => {
    const pending: Array<{ resolve: (value: unknown) => void }> = [];
    const requestResponse = vi
      .fn()
      .mockResolvedValueOnce({
        data: [],
        meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
      })
      .mockImplementation(
        () =>
          new Promise<unknown>((resolve) => {
            pending.push({ resolve });
          }),
      );
    renderPage(
      requestResponse as unknown as <T>(
        path: string,
        init?: RequestInit,
      ) => Promise<T>,
    );
    await screen.findByText('No tasks yet.');
    expect(requestResponse).toHaveBeenCalledOnce();

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search tasks' }), {
      target: { value: 'a' },
    });
    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(requestResponse).toHaveBeenCalledOnce();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(requestResponse).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search tasks' }), {
      target: { value: 'ab' },
    });
    expect(requestResponse.mock.calls[1][1]?.signal).toBeInstanceOf(
      AbortSignal,
    );
    expect(requestResponse.mock.calls[1][1]?.signal?.aborted).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(requestResponse).toHaveBeenCalledTimes(3);

    pending[1].resolve({
      data: [
        {
          id: 'latest',
          ownerId: 'member-id',
          title: 'Latest task',
          description: null,
          status: 'pending',
          dueDate: null,
          createdAt: '2026-09-09T00:00:00.000Z',
          updatedAt: '2026-09-09T00:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });
    await act(async () => {});
    pending[0].resolve({
      data: [
        {
          id: 'stale',
          ownerId: 'member-id',
          title: 'Stale task',
          description: null,
          status: 'pending',
          dueDate: null,
          createdAt: '2026-09-09T00:00:00.000Z',
          updatedAt: '2026-09-09T00:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });

    expect(screen.getByText('Latest task')).toBeInTheDocument();
    expect(screen.queryByText('Stale task')).not.toBeInTheDocument();
  });
});
