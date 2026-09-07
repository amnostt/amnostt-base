import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SessionProvider } from './features/auth/components/session-provider'
import { createSessionStore } from './features/auth/store/session-store'
import type { AuthRepository } from './features/auth/domain/auth-repository'
import { ApiError } from './core/http/api-client'

const user = { id: '1', name: 'Ada', email: 'ada@example.com', role: 'Admin', permissions: [] }
function auth(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return { login: vi.fn(), restore: vi.fn().mockResolvedValue({ accessToken: 'token', currentUser: user }), refresh: vi.fn().mockResolvedValue('token'), logout: vi.fn().mockResolvedValue(undefined), ...overrides }
}
function unauth(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return auth({ restore: vi.fn().mockRejectedValue(new Error('no session')), ...overrides })
}
function renderIntegration(api: AuthRepository) {
  const store = createSessionStore(api)
  render(<SessionProvider store={store}><App /></SessionProvider>)
  return store
}
function renderWithRequest(api: AuthRepository, request: <T>(path: string, init?: RequestInit) => Promise<T>) {
  const store = createSessionStore(api, request)
  render(<SessionProvider store={store}><App /></SessionProvider>)
  return store
}
function renderWithResponse(api: AuthRepository, requestResponse: <T>(path: string, init?: RequestInit) => Promise<T>) {
  const store = createSessionStore(api, vi.fn(), requestResponse)
  render(<SessionProvider store={store}><App /></SessionProvider>)
  return store
}
afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

describe('App session integration', () => {
  it('renders login validation errors without submitting invalid credentials', async () => {
    const api = unauth({ login: vi.fn() })
    renderIntegration(api)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email and password.')
    expect(api.login).not.toHaveBeenCalled()
  })

  it('shows login submission state and sends the form values', async () => {
    let finish!: (value: { accessToken: string; currentUser: typeof user }) => void
    const api = unauth({ login: vi.fn(() => new Promise<{ accessToken: string; currentUser: typeof user }>((resolve) => { finish = resolve })) })
    renderIntegration(api)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
    const formUser = userEvent.setup()
    await formUser.type(screen.getByLabelText('Email'), 'ada@example.com')
    await formUser.type(screen.getByLabelText('Password'), 'secret')
    await formUser.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
    finish({ accessToken: 'login-token', currentUser: user })
    await waitFor(() => expect(screen.getByText('Role: Admin')).toBeInTheDocument())
    expect(api.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret' })
  })

  it('shows a generic login error and clears the password after failure', async () => {
    const api = unauth({ login: vi.fn().mockRejectedValue(new Error('bad credentials')) })
    renderIntegration(api)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
    const formUser = userEvent.setup()
    await formUser.type(screen.getByLabelText('Email'), 'ada@example.com')
    await formUser.type(screen.getByLabelText('Password'), 'secret')
    await formUser.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to sign in'))
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('clears the password after a successful login', async () => {
    const api = unauth({ login: vi.fn().mockResolvedValue({ accessToken: 'login-token', currentUser: user }) })
    renderIntegration(api)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
    const formUser = userEvent.setup()
    await formUser.type(screen.getByLabelText('Email'), 'ada@example.com')
    await formUser.type(screen.getByLabelText('Password'), 'secret')
    await formUser.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('Role: Admin')).toBeInTheDocument())
    expect(api.login).toHaveBeenCalledOnce()
  })

  it('keeps the bootstrap loading surface visible while refresh is pending', async () => {
    let finish!: (value: { accessToken: string; currentUser: typeof user }) => void
    const api = auth({ restore: vi.fn(() => new Promise<{ accessToken: string; currentUser: typeof user }>((resolve) => { finish = resolve })) })
    renderIntegration(api)
    expect(screen.getByRole('status')).toHaveTextContent('Loading session')
    await waitFor(() => expect(api.restore).toHaveBeenCalled())
    finish({ accessToken: 'token', currentUser: user })
    await waitFor(() => expect(screen.getByRole('heading', { name: /Welcome/ })).toBeInTheDocument())
  })

  it('gates protected content while an authenticated request refreshes', async () => {
    let finish!: (value: string) => void
    const request = vi.fn().mockRejectedValueOnce(new ApiError(401))
    const api = auth({ refresh: vi.fn(() => new Promise<string>((resolve) => { finish = resolve })) })
    const store = renderWithRequest(api, request)
    await waitFor(() => expect(screen.getByRole('heading', { name: /Welcome/ })).toBeInTheDocument())
    void store.getState().request('/protected')
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(screen.queryByText(/Welcome/)).not.toBeInTheDocument()
    finish('new-token')
  })

  it('renders the session-expired notice after refresh fails', async () => {
    const request = vi.fn().mockRejectedValueOnce(new ApiError(401))
    const api = auth({ refresh: vi.fn().mockRejectedValue(new Error('expired')) })
    const store = renderWithRequest(api, request)
    await waitFor(() => expect(screen.getByText('Role: Admin')).toBeInTheDocument())
    await expect(store.getState().request('/protected')).rejects.toBeDefined()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('session expired'))
  })

  it('renders authenticated identity email and role', async () => {
    renderIntegration(auth())
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('Role: Admin')).toBeInTheDocument()
  })

  it('protects the logout action while logout is pending', async () => {
    let finish!: () => void
    const api = auth({ logout: vi.fn(() => new Promise<void>((resolve) => { finish = resolve })) })
    renderIntegration(api)
    await screen.findByRole('button', { name: 'Log out' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading session'))
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
    finish()
  })
  it('bootstraps on mount and renders the authenticated shell', async () => {
    const api = auth()
    renderIntegration(api)
    await waitFor(() => expect(screen.getByRole('heading', { name: /Ada/ })).toBeInTheDocument())
    expect(api.restore).toHaveBeenCalledOnce()
  })

  it('shows no protected content while logout is pending, then returns to login', async () => {
    let finish!: () => void
    const api = auth({ logout: vi.fn(() => new Promise<void>((resolve) => { finish = resolve })) })
    renderIntegration(api)
    await screen.findByRole('button', { name: 'Log out' })
    const pending = userEvent.setup()
    await pending.click(screen.getByRole('button', { name: 'Log out' }))
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/Welcome/)).not.toBeInTheDocument()
    finish()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
  })

  it('silently returns to login when remote logout fails', async () => {
    const api = auth({ logout: vi.fn().mockRejectedValue(new Error('remote failure')) })
    renderIntegration(api)
    await screen.findByRole('button', { name: 'Log out' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
    expect(screen.queryByText(/remote failure/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps any-only readers in the shell with forbidden content and no task navigation', async () => {
    window.history.pushState({}, '', '/tasks')
    const anyOnlyUser = { ...user, permissions: ['tasks:read:any'] }
    const api = auth({ restore: vi.fn().mockResolvedValue({ accessToken: 'token', currentUser: anyOnlyUser }) })

    renderIntegration(api)

    expect(await screen.findByRole('alert')).toHaveTextContent('403')
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Tasks' })).not.toBeInTheDocument()
  })

  it('keeps task navigation and list access for users with the own-read grant', async () => {
    window.history.pushState({}, '', '/tasks')
    const ownReader = { ...user, permissions: ['tasks:read:own'] }
    const api = auth({ restore: vi.fn().mockResolvedValue({ accessToken: 'token', currentUser: ownReader }) })
    const requestResponse = vi.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } })

    renderWithResponse(api, requestResponse)

    expect(await screen.findByRole('link', { name: 'Tasks' })).toBeInTheDocument()
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
  })

  it('returns to the originally requested task route after login without a refresh', async () => {
    window.history.pushState({}, '', '/tasks')
    const ownReader = { ...user, permissions: ['tasks:read:own'] }
    const api = unauth({ login: vi.fn().mockResolvedValue({ accessToken: 'login-token', currentUser: ownReader }) })
    const requestResponse = vi.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } })

    renderWithResponse(api, requestResponse)

    await screen.findByRole('heading', { name: 'Sign in' })
    expect(window.location.pathname).toBe('/login')
    expect(window.location.search).toBe('?returnTo=%2Ftasks')

    const formUser = userEvent.setup()
    await formUser.type(screen.getByLabelText('Email'), 'ada@example.com')
    await formUser.type(screen.getByLabelText('Password'), 'secret')
    await formUser.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
    expect(screen.queryByText('Page not found.')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/tasks')
  })
})
