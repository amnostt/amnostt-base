import { describe, expect, it, vi } from 'vitest'
import { createSessionController } from './session-controller'
import type { AuthApi } from './auth-api'
import type { CurrentUser } from './auth-types'
import { ApiError } from './api-client'

const user: CurrentUser = { id: '1', email: 'a@example.com', name: 'A', role: 'user', permissions: [] }
const api = (overrides: Partial<AuthApi> = {}): AuthApi => ({
  login: vi.fn().mockResolvedValue({ accessToken: 'login-token', currentUser: user }),
  me: vi.fn().mockResolvedValue(user),
  refresh: vi.fn().mockResolvedValue({ accessToken: 'refresh-token' }),
  logout: vi.fn().mockResolvedValue(undefined),
  ...overrides,
})
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }

describe('SessionController', () => {
  it('bootstraps idempotently through refresh then me and logs in without me', async () => {
    const auth = api()
    const controller = createSessionController(auth)
    await Promise.all([controller.bootstrap(), controller.bootstrap()])
    expect(auth.refresh).toHaveBeenCalledOnce()
    expect(auth.me).toHaveBeenCalledWith('refresh-token')
    expect(controller.getSnapshot()).toEqual({ status: 'authenticated', user })

    await controller.login({ email: 'a@example.com', password: 'secret' })
    expect(auth.login).toHaveBeenCalledWith({ email: 'a@example.com', password: 'secret' })
    expect(auth.me).toHaveBeenCalledOnce()
  })

  it('shares refresh, retries each request once, and handles a changed token race', async () => {
    let rejectRefresh!: (error: Error) => void
    const refresh = vi.fn().mockReturnValue(new Promise((_, reject) => { rejectRefresh = reject }))
    const auth = api({ refresh })
    const controller = createSessionController(auth)
    await controller.login({ email: 'a@example.com', password: 'secret' })
    const request = vi.fn()
      .mockRejectedValueOnce(new ApiError(401))
      .mockRejectedValueOnce(new ApiError(401))
      .mockResolvedValue({ value: 1 })
    const requester = async <T>(path: string, init?: RequestInit) => request(path, init) as Promise<T>
    const requestController = createSessionController(auth, requester)
    await requestController.login({ email: 'a@example.com', password: 'secret' })
    const first = requestController.request('/one')
    const second = requestController.request('/two')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(auth.refresh).toHaveBeenCalledOnce()
    rejectRefresh(new Error('expired'))
    await expect(first).rejects.toThrow('expired')
    await expect(second).rejects.toThrow('expired')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('publishes refreshing while refresh is pending and retries successfully', async () => {
    let resolveRefresh!: (value: { accessToken: string }) => void
    const auth = api({ refresh: vi.fn(() => new Promise<{ accessToken: string }>((resolve) => { resolveRefresh = resolve })) })
    const request = vi.fn().mockRejectedValueOnce(new ApiError(401)).mockResolvedValue({ value: 2 })
    const controller = createSessionController(auth, async <T>(path: string, init?: RequestInit) => request(path, init) as Promise<T>)
    await controller.login({ email: 'a@example.com', password: 'secret' })
    const pending = controller.request('/data')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(controller.getSnapshot()).toEqual({ status: 'request-refreshing' })
    resolveRefresh({ accessToken: 'new-token' })
    await expect(pending).resolves.toEqual({ value: 2 })
  })

  it('does not let stale refresh or login completions restore state after logout', async () => {
    let resolveLogin!: (value: Awaited<ReturnType<AuthApi['login']>>) => void
    const auth = api({ login: vi.fn(() => new Promise<{ accessToken: string; currentUser: CurrentUser }>((resolve) => { resolveLogin = resolve })) })
    const controller = createSessionController(auth)
    const login = controller.login({ email: 'a@example.com', password: 'secret' })
    await controller.logout()
    resolveLogin({ accessToken: 'stale', currentUser: user })
    await login
    expect(controller.getSnapshot()).toEqual({ status: 'unauthenticated' })
  })

  it('does not let an older rejected login erase a newer authenticated session', async () => {
    let rejectOldLogin!: (error: Error) => void
    const auth = api({
      login: vi.fn()
        .mockReturnValueOnce(new Promise((_, reject) => { rejectOldLogin = reject }))
        .mockResolvedValueOnce({ accessToken: 'new-token', currentUser: user }),
    })
    const controller = createSessionController(auth)

    const oldLogin = controller.login({ email: 'old@example.com', password: 'wrong' })
    await controller.logout()
    await controller.login({ email: 'new@example.com', password: 'secret' })
    rejectOldLogin(new Error('invalid credentials'))

    await expect(oldLogin).rejects.toThrow(ApiError)
    expect(controller.getSnapshot()).toEqual({ status: 'authenticated', user })
  })

  it('shows session-expired only for a post-auth refresh failure and never uses an empty token', async () => {
    const auth = api({ refresh: vi.fn().mockRejectedValue(new Error('expired')) })
    const controller = createSessionController(auth, async <T>(path: string) => { void path; throw new ApiError(401) as T })
    await controller.login({ email: 'a@example.com', password: 'secret' })
    await expect(controller.request('/data')).rejects.toThrow('expired')
    expect(controller.getSnapshot()).toEqual({ status: 'unauthenticated', notice: 'session-expired' })
  })

  it('shares a successful refresh and retries every concurrent request', async () => {
    let resolveRefresh!: (value: { accessToken: string }) => void
    const auth = api({ refresh: vi.fn(() => new Promise<{ accessToken: string }>((resolve) => { resolveRefresh = resolve })) })
    const request = vi.fn()
      .mockRejectedValueOnce(new ApiError(401))
      .mockRejectedValueOnce(new ApiError(401))
      .mockResolvedValueOnce({ value: 'one' })
      .mockResolvedValueOnce({ value: 'two' })
    const controller = createSessionController(auth, async <T>(path: string, init?: RequestInit) => request(path, init) as Promise<T>)
    await controller.login({ email: 'a@example.com', password: 'secret' })

    const first = controller.request('/one')
    const second = controller.request('/two')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(auth.refresh).toHaveBeenCalledOnce()
    resolveRefresh({ accessToken: 'new-token' })

    await expect(first).resolves.toEqual({ value: 'one' })
    await expect(second).resolves.toEqual({ value: 'two' })
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('clears local state on logout even when remote logout fails', async () => {
    const auth = api({ logout: vi.fn().mockRejectedValue(new Error('offline')) })
    const controller = createSessionController(auth)
    await controller.login({ email: 'a@example.com', password: 'secret' })
    await controller.logout()
    expect(controller.getSnapshot()).toEqual({ status: 'unauthenticated' })
    expect(auth.logout).toHaveBeenCalledOnce()
  })

  it('does not refresh or retry after the retry request also returns 401', async () => {
    const auth = api({ refresh: vi.fn().mockResolvedValue({ accessToken: 'new-token' }) })
    const request = vi.fn().mockRejectedValue(new ApiError(401))
    const controller = createSessionController(auth, async <T>(path: string, init?: RequestInit) => request(path, init) as Promise<T>)
    await controller.login({ email: 'a@example.com', password: 'secret' })
    await expect(controller.request('/data')).rejects.toThrow(ApiError)
    expect(auth.refresh).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('ignores a refresh completed after logout without retrying', async () => {
    const pending = deferred<{ accessToken: string }>()
    const auth = api({ refresh: vi.fn(() => pending.promise) })
    const request = vi.fn().mockRejectedValue(new ApiError(401))
    const controller = createSessionController(auth, async <T>(path: string, init?: RequestInit) => request(path, init) as Promise<T>)
    await controller.login({ email: 'a@example.com', password: 'secret' })
    const failed = controller.request('/data')
    await controller.logout()
    pending.resolve({ accessToken: 'stale-token' })
    await expect(failed).rejects.toThrow(ApiError)
    expect(request).toHaveBeenCalledOnce()
    expect(controller.getSnapshot()).toEqual({ status: 'unauthenticated' })
  })

  it('does not let a stale refresh overwrite a new login token or identity', async () => {
    const pending = deferred<{ accessToken: string }>()
    const newUser = { ...user, id: '2', email: 'new@example.com' }
    const auth = api({ refresh: vi.fn(() => pending.promise), login: vi.fn().mockResolvedValue({ accessToken: 'new-login-token', currentUser: newUser }) })
    const request = vi.fn().mockRejectedValue(new ApiError(401))
    const controller = createSessionController(auth, async <T>(path: string, init?: RequestInit) => request(path, init) as Promise<T>)
    await controller.login({ email: 'a@example.com', password: 'secret' })
    const failed = controller.request('/data')
    await controller.login({ email: 'new@example.com', password: 'secret' })
    pending.resolve({ accessToken: 'stale-refresh-token' })
    await expect(failed).rejects.toThrow(ApiError)
    expect(controller.getSnapshot()).toEqual({ status: 'authenticated', user: newUser })
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1][1].headers.Authorization).toBe('Bearer new-login-token')
  })

  it('silently returns unauthenticated when bootstrap refresh returns 401', async () => {
    const auth = api({ refresh: vi.fn().mockRejectedValue(new ApiError(401)) })
    const controller = createSessionController(auth)
    await controller.bootstrap()
    expect(controller.getSnapshot()).toEqual({ status: 'unauthenticated' })
  })
})
