import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SessionProvider } from './components/auth/session-provider'
import { createSessionController } from './lib/session-controller'
import type { AuthApi } from './lib/auth-api'
import { ApiError } from './lib/api-client'

const user = { id: '1', name: 'Ada', email: 'ada@example.com', role: 'Admin', permissions: [] }
function auth(overrides: Partial<AuthApi> = {}): AuthApi {
  return { login: vi.fn(), me: vi.fn().mockResolvedValue(user), refresh: vi.fn().mockResolvedValue({ accessToken: 'token' }), logout: vi.fn().mockResolvedValue(undefined), ...overrides }
}
function unauth(overrides: Partial<AuthApi> = {}): AuthApi {
  return auth({ refresh: vi.fn().mockRejectedValue(new Error('no session')), ...overrides })
}
function renderIntegration(api: AuthApi) {
  const controller = createSessionController(api)
  render(<SessionProvider controller={controller}><App /></SessionProvider>)
  return controller
}
function renderWithRequest(api: AuthApi, request: <T>(path: string, init?: RequestInit) => Promise<T>) {
  const controller = createSessionController(api, request)
  render(<SessionProvider controller={controller}><App /></SessionProvider>)
  return controller
}
afterEach(cleanup)

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
    let finish!: (value: { accessToken: string }) => void
    const api = auth({ refresh: vi.fn(() => new Promise<{ accessToken: string }>((resolve) => { finish = resolve })) })
    renderIntegration(api)
    expect(screen.getByRole('status')).toHaveTextContent('Loading session')
    await waitFor(() => expect(api.refresh).toHaveBeenCalled())
    finish({ accessToken: 'token' })
    await waitFor(() => expect(screen.getByRole('heading', { name: /Welcome/ })).toBeInTheDocument())
  })

  it('gates protected content while an authenticated request refreshes', async () => {
    let finish!: (value: { accessToken: string }) => void
    const request = vi.fn().mockRejectedValueOnce(new ApiError(401))
    const api = auth({ refresh: vi.fn().mockResolvedValueOnce({ accessToken: 'token' }).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })) })
    const controller = renderWithRequest(api, request)
    await waitFor(() => expect(screen.getByRole('heading', { name: /Welcome/ })).toBeInTheDocument())
    void controller.request('/protected')
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(screen.queryByText(/Welcome/)).not.toBeInTheDocument()
    finish({ accessToken: 'new-token' })
  })

  it('renders the session-expired notice after refresh fails', async () => {
    const request = vi.fn().mockRejectedValueOnce(new ApiError(401))
    const api = auth({ refresh: vi.fn().mockResolvedValueOnce({ accessToken: 'token' }).mockRejectedValueOnce(new Error('expired')) })
    const controller = renderWithRequest(api, request)
    await waitFor(() => expect(screen.getByText('Role: Admin')).toBeInTheDocument())
    await expect(controller.request('/protected')).rejects.toBeDefined()
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
    expect(api.refresh).toHaveBeenCalledOnce()
    expect(api.me).toHaveBeenCalledWith('token')
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
})
