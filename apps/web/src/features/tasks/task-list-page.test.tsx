import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '../auth/components/session-provider'
import { createSessionStore } from '../auth/store/session-store'
import type { AuthRepository } from '../auth/domain/auth-repository'
import { TaskListPage } from './task-list-page'

const user = {
  id: 'member-id',
  email: 'member@example.com',
  name: 'Member User',
  role: 'Member',
  permissions: ['tasks:read:own', 'tasks:update:own', 'tasks:delete:own'],
}

function renderPage(
  requestResponse: <T>(path: string, init?: RequestInit) => Promise<T>,
  request: <T>(path: string, init?: RequestInit) => Promise<T> = vi.fn(),
) {
  const auth: AuthRepository = {
    login: vi.fn(),
    restore: vi.fn().mockResolvedValue({ accessToken: 'token', currentUser: user }),
    refresh: vi.fn(),
    logout: vi.fn(),
  }
  const store = createSessionStore(auth, request, requestResponse)
  render(<MemoryRouter><SessionProvider store={store}><TaskListPage /></SessionProvider></MemoryRouter>)
  void store.getState().bootstrap()
  return store
}

afterEach(cleanup)

describe('TaskListPage', () => {
  it('shows a table skeleton while the collection request is pending', async () => {
    const requestResponse = vi.fn(() => new Promise<unknown>(() => {}))
    renderPage(requestResponse as unknown as <T>(path: string, init?: RequestInit) => Promise<T>)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading tasks'))
    expect(screen.getAllByRole('row')).toHaveLength(4)
  })

  it('distinguishes an empty collection from an empty filtered result', async () => {
    const requestResponse = vi.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } })
    renderPage(requestResponse)

    await waitFor(() => expect(screen.getByText('No tasks yet.')).toBeInTheDocument())
    expect(screen.queryByText('No tasks match your criteria.')).not.toBeInTheDocument()
  })

  it('shows a general error and retries the same collection request', async () => {
    const requestResponse = vi.fn()
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce({ data: [{ id: 'task-1', ownerId: 'member-id', title: 'Report', description: null, status: 'pending', dueDate: null, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z' }], meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 } })
    renderPage(requestResponse)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to load tasks'))
    await screen.findByRole('button', { name: 'Retry' }).then((button) => button.click())
    await waitFor(() => expect(screen.getByText('Report')).toBeInTheDocument())
    expect(requestResponse).toHaveBeenCalledTimes(2)
  })

  it('shows edit only for rows owned by the authenticated user', async () => {
    const ownTask = { id: 'own-task', ownerId: 'member-id', title: 'Own task', description: null, status: 'pending', dueDate: null, createdAt: '2024-09-06T00:00:00.000Z', updatedAt: '2024-09-06T00:00:00.000Z' }
    const foreignTask = { id: 'foreign-task', ownerId: 'other-id', title: 'Foreign task', description: null, status: 'pending', dueDate: null, createdAt: '2024-09-06T00:00:00.000Z', updatedAt: '2024-09-06T00:00:00.000Z' }
    const requestResponse = vi.fn().mockResolvedValue({ data: [ownTask, foreignTask], meta: { page: 1, limit: 20, totalItems: 2, totalPages: 1 } })
    renderPage(requestResponse)

    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Edit task' })).toHaveLength(1))
    expect(screen.getByRole('link', { name: 'Edit task' })).toHaveAttribute('href', '/tasks/own-task/edit')
    expect(screen.getAllByRole('button', { name: 'Delete task' })).toHaveLength(1)
  })

  it('confirms permanent deletion and prevents duplicate submissions', async () => {
    const task = { id: 'own-task', ownerId: 'member-id', title: 'Disposable task', description: null, status: 'pending', dueDate: null, createdAt: '2024-09-06T00:00:00.000Z', updatedAt: '2024-09-06T00:00:00.000Z' }
    const request = vi.fn(() => new Promise<never>(() => {}))
    const requestResponse = vi.fn().mockResolvedValue({ data: [task], meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 } })
    renderPage(requestResponse, request)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Delete task' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete task permanently?')

    const confirm = screen.getByRole('button', { name: 'Delete task permanently' })
    await user.click(confirm)
    expect(request).toHaveBeenCalledWith('/tasks/own-task', {
      headers: { Authorization: 'Bearer token' },
      method: 'DELETE',
    })
    expect(confirm).toBeDisabled()

    await user.click(confirm)
    expect(request).toHaveBeenCalledOnce()
  })
})
