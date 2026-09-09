import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import type { AuthRepository } from '../auth/domain/auth-repository';
import { SessionProvider } from '../auth/components/session-provider';
import { createSessionStore } from '../auth/store/session-store';

const user = {
  id: 'member-id',
  email: 'member@example.com',
  name: 'Member User',
  role: 'Member',
  permissions: [
    'tasks:create:own',
    'tasks:read:own',
    'tasks:update:own',
    'tasks:delete:own',
  ],
};

function renderApp(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  requestResponse: <T>(path: string, init?: RequestInit) => Promise<T>,
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
    <SessionProvider store={store}>
      <App />
    </SessionProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('task create route', () => {
  it('preserves the list query when a dirty create form is closed', async () => {
    window.history.pushState({}, '', '/tasks?search=report&page=2');
    const requestResponse = vi.fn().mockResolvedValue({
      data: [],
      meta: { page: 2, limit: 20, totalItems: 0, totalPages: 0 },
    });
    renderApp(vi.fn(), requestResponse);
    const userEventApi = userEvent.setup();

    await userEventApi.click(
      await screen.findByRole('link', { name: 'Create task' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Create task panel' }),
    ).toHaveAttribute('data-side', 'right');
    await userEventApi.type(screen.getByLabelText('Title'), 'Draft task');
    await userEventApi.click(screen.getByRole('button', { name: 'Close' }));
    await userEventApi.click(
      screen.getByRole('button', { name: 'Discard changes' }),
    );

    await waitFor(() => expect(window.location.pathname).toBe('/tasks'));
    expect(window.location.search).toBe('?search=report&page=2');
    await waitFor(() => expect(requestResponse).toHaveBeenCalledTimes(3));
  });

  it('closes the create route and refetches the list after a successful save', async () => {
    window.history.pushState({}, '', '/tasks?status=pending');
    const request = vi.fn().mockResolvedValue({ id: 'task-1' });
    const requestResponse = vi.fn().mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
    });
    renderApp(request, requestResponse);
    const userEventApi = userEvent.setup();

    await userEventApi.click(
      await screen.findByRole('link', { name: 'Create task' }),
    );
    await userEventApi.type(screen.getByLabelText('Title'), 'Created task');
    await userEventApi.click(
      screen.getByRole('button', { name: 'Create task' }),
    );

    await waitFor(() => expect(window.location.pathname).toBe('/tasks'));
    expect(window.location.search).toBe('?status=pending');
    expect(request).toHaveBeenCalledOnce();
    const toast = await screen.findByRole('status');
    expect(toast).toHaveAttribute('data-slot', 'toast');
    expect(toast).toHaveTextContent('Task created.');
    await waitFor(() => expect(requestResponse).toHaveBeenCalledTimes(3));
  });

  it('opens the owned task edit route and loads the selected task', async () => {
    const task = {
      id: 'task-1',
      ownerId: 'member-id',
      title: 'Report task',
      description: null,
      status: 'pending',
      dueDate: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    } as const;
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/tasks/task-1') return task;
      return { id: 'task-1' };
    });
    const requestResponse = vi.fn().mockResolvedValue({
      data: [task],
      meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });
    window.history.pushState({}, '', '/tasks?search=report');
    renderApp(request, requestResponse);

    const userEventApi = userEvent.setup();
    await userEventApi.click(
      await screen.findByRole('button', {
        name: 'More actions for Report task',
      }),
    );
    await userEventApi.click(
      screen.getByRole('menuitem', { name: 'Edit task' }),
    );

    expect(window.location.pathname).toBe('/tasks/task-1/edit');
    expect(
      screen.getByRole('dialog', { name: 'Edit task panel' }),
    ).toHaveAttribute('data-side', 'right');
    expect(await screen.findByDisplayValue('Report task')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/tasks/task-1', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  it('closes the edit panel and shows a toast after a successful update', async () => {
    const task = {
      id: 'task-1',
      ownerId: 'member-id',
      title: 'Report task',
      description: null,
      status: 'pending',
      dueDate: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    } as const;
    const request = vi
      .fn()
      .mockImplementation(async (path: string) =>
        path === '/tasks/task-1' ? task : { id: 'task-1' },
      );
    const requestResponse = vi.fn().mockResolvedValue({
      data: [task],
      meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });
    window.history.pushState({}, '', '/tasks');
    renderApp(request, requestResponse);
    const userEventApi = userEvent.setup();

    await userEventApi.click(
      await screen.findByRole('button', {
        name: 'More actions for Report task',
      }),
    );
    await userEventApi.click(
      screen.getByRole('menuitem', { name: 'Edit task' }),
    );
    await userEventApi.clear(await screen.findByDisplayValue('Report task'));
    await userEventApi.type(screen.getByLabelText('Title'), 'Updated report');
    await userEventApi.click(
      screen.getByRole('button', { name: 'Update task' }),
    );

    await waitFor(() => expect(window.location.pathname).toBe('/tasks'));
    const toast = await screen.findByRole('status');
    expect(toast).toHaveAttribute('data-slot', 'toast');
    expect(toast).toHaveTextContent('Task updated.');
  });

  it('deletes a task, refetches the list, and confirms completion', async () => {
    const task = {
      id: 'task-1',
      ownerId: 'member-id',
      title: 'Disposable task',
      description: null,
      status: 'pending',
      dueDate: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    } as const;
    const request = vi.fn().mockResolvedValue(undefined);
    const requestResponse = vi.fn().mockResolvedValue({
      data: [task],
      meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });
    window.history.pushState({}, '', '/tasks');
    renderApp(request, requestResponse);
    const userEventApi = userEvent.setup();

    await userEventApi.click(
      await screen.findByRole('button', {
        name: 'More actions for Disposable task',
      }),
    );
    await userEventApi.click(
      screen.getByRole('menuitem', { name: 'Delete task' }),
    );
    await userEventApi.click(
      screen.getByRole('button', { name: 'Delete task permanently' }),
    );

    await waitFor(() => expect(window.location.pathname).toBe('/tasks'));
    expect(request).toHaveBeenCalledWith('/tasks/task-1', {
      headers: { Authorization: 'Bearer token' },
      method: 'DELETE',
    });
    expect(request).toHaveBeenCalledOnce();
    const toast = await screen.findByRole('status');
    expect(toast).toHaveAttribute('data-slot', 'toast');
    expect(toast).toHaveTextContent('Task deleted.');
    await waitFor(() => expect(requestResponse).toHaveBeenCalledTimes(2));
  });

  it('synchronizes search, filters, sorting, and pagination with the URL', async () => {
    const task = {
      id: 'task-1',
      ownerId: 'member-id',
      title: 'Report task',
      description: 'A report',
      status: 'completed',
      dueDate: '2024-02-29',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    } as const;
    const requestResponse = vi.fn().mockResolvedValue({
      data: [task],
      meta: { page: 1, limit: 20, totalItems: 21, totalPages: 2 },
    });
    window.history.pushState({}, '', '/tasks');
    renderApp(vi.fn(), requestResponse);
    const userEventApi = userEvent.setup();

    await userEventApi.type(
      await screen.findByLabelText('Search tasks'),
      'Report',
    );
    await userEventApi.selectOptions(
      screen.getByLabelText('Status'),
      'completed',
    );
    await userEventApi.selectOptions(
      screen.getByLabelText('Sort by'),
      '-title',
    );
    await userEventApi.selectOptions(
      screen.getByLabelText('Items per page'),
      '10',
    );
    await userEventApi.click(screen.getByRole('button', { name: 'Next page' }));

    expect(window.location.search).toBe(
      '?search=Report&status=completed&sort=-title&page=2&limit=10',
    );
    expect(requestResponse).toHaveBeenLastCalledWith(
      '/tasks?search=Report&status=completed&sort=-title&page=2&limit=10',
      { headers: { Authorization: 'Bearer token' } },
    );
  });
});
