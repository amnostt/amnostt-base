import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import type { AuthRepository } from '../auth/domain/auth-repository'
import { SessionProvider } from '../auth/components/session-provider'
import { createSessionStore } from '../auth/store/session-store'

const user = {
  id: 'member-id',
  email: 'member@example.com',
  name: 'Member User',
  role: 'Member',
  permissions: ['tasks:create:own', 'tasks:read:own'],
}

function renderApp(request: <T>(path: string, init?: RequestInit) => Promise<T>, requestResponse: <T>(path: string, init?: RequestInit) => Promise<T>) {
  const auth: AuthRepository = {
    login: vi.fn(),
    restore: vi.fn().mockResolvedValue({ accessToken: 'token', currentUser: user }),
    refresh: vi.fn(),
    logout: vi.fn(),
  }
  const store = createSessionStore(auth, request, requestResponse)
  render(<SessionProvider store={store}><App /></SessionProvider>)
}

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

describe('task create route', () => {
  it('preserves the list query when a dirty create form is closed', async () => {
    window.history.pushState({}, '', '/tasks?search=report&page=2')
    const requestResponse = vi.fn().mockResolvedValue({ data: [], meta: { page: 2, limit: 20, totalItems: 0, totalPages: 0 } })
    renderApp(vi.fn(), requestResponse)
    const userEventApi = userEvent.setup()

    await userEventApi.click(await screen.findByRole('link', { name: 'Create task' }))
    await userEventApi.type(screen.getByLabelText('Title'), 'Draft task')
    await userEventApi.click(screen.getByRole('button', { name: 'Close' }))
    await userEventApi.click(screen.getByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(window.location.pathname).toBe('/tasks'))
    expect(window.location.search).toBe('?search=report&page=2')
    await waitFor(() => expect(requestResponse).toHaveBeenCalledTimes(3))
  })

  it('closes the create route and refetches the list after a successful save', async () => {
    window.history.pushState({}, '', '/tasks?status=pending')
    const request = vi.fn().mockResolvedValue({ id: 'task-1' })
    const requestResponse = vi.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } })
    renderApp(request, requestResponse)
    const userEventApi = userEvent.setup()

    await userEventApi.click(await screen.findByRole('link', { name: 'Create task' }))
    await userEventApi.type(screen.getByLabelText('Title'), 'Created task')
    await userEventApi.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(window.location.pathname).toBe('/tasks'))
    expect(window.location.search).toBe('?status=pending')
    expect(request).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent('Task created.')
    await waitFor(() => expect(requestResponse).toHaveBeenCalledTimes(3))
  })
})
