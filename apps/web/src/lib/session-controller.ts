import { ApiError } from './api-client'
import type { AuthApi } from './auth-api'
import type { CurrentUser, SessionState } from './auth-types'

export interface SessionController {
  getSnapshot(): SessionState
  subscribe(listener: () => void): () => void
  bootstrap(): Promise<void>
  login(input: { email: string; password: string }): Promise<void>
  logout(): Promise<void>
  request<T>(path: string, init?: RequestInit): Promise<T>
}

type Requester = <T>(path: string, init?: RequestInit) => Promise<T>

export function createSessionController(auth: AuthApi, request: Requester = defaultRequest): SessionController {
  let token: string | undefined
  let currentUser: CurrentUser | undefined
  let snapshot: SessionState = { status: 'bootstrap-loading' }
  let epoch = 0
  let bootstrapPromise: Promise<void> | undefined
  let refreshPromise: Promise<string> | undefined
  const listeners = new Set<() => void>()
  const publish = (next: SessionState) => { snapshot = next; listeners.forEach((listener) => listener()) }
  const clearSession = (notice?: 'session-expired') => { token = undefined; currentUser = undefined; epoch += 1; publish(notice ? { status: 'unauthenticated', notice } : { status: 'unauthenticated' }) }

  const bootstrap = (): Promise<void> => {
    if (bootstrapPromise) return bootstrapPromise
    const startEpoch = epoch
    bootstrapPromise = auth.refresh().then(async ({ accessToken }) => {
      if (startEpoch !== epoch) return
      token = accessToken
      const user = await auth.me(accessToken)
      if (startEpoch === epoch) { currentUser = user; publish({ status: 'authenticated', user }) }
    }).catch(() => { if (startEpoch === epoch) clearSession() }).finally(() => { bootstrapPromise = undefined })
    return bootstrapPromise
  }

  const login = async (input: { email: string; password: string }) => {
    if (snapshot.status === 'login-submitting' || snapshot.status === 'logout-pending') return
    const loginEpoch = ++epoch
    publish({ status: 'login-submitting', email: input.email })
    try {
      const result = await auth.login(input)
      if (loginEpoch !== epoch) return
      token = result.accessToken
      currentUser = result.currentUser
      publish({ status: 'authenticated', user: result.currentUser })
    } catch {
      publish({ status: 'unauthenticated' })
      throw new ApiError(0)
    }
  }

  const logout = async () => {
    if (snapshot.status === 'logout-pending') return
    publish({ status: 'logout-pending' })
    token = undefined
    currentUser = undefined
    epoch += 1
    try { await auth.logout() } catch { /* local cleanup is authoritative */ }
    publish({ status: 'unauthenticated' })
  }

  const refresh = async (sentToken: string, sentEpoch = epoch): Promise<string> => {
    if (sentEpoch !== epoch) return token ?? ''
    if (token !== sentToken || !sentToken) return token ?? ''
    if (!refreshPromise) {
      const refreshEpoch = epoch
      publish({ status: 'request-refreshing' })
      const promise = auth.refresh().then(({ accessToken }) => {
        if (refreshEpoch !== epoch || token !== sentToken) return token ?? ''
        token = accessToken
        if (currentUser) publish({ status: 'authenticated', user: currentUser })
        return accessToken
      }).catch((error) => { if (refreshEpoch === epoch) clearSession('session-expired'); throw error })
      const coordinated = promise.finally(() => { if (refreshPromise === coordinated) refreshPromise = undefined })
      refreshPromise = coordinated
    }
    return refreshPromise
  }

  const controller: SessionController = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    bootstrap, login, logout,
    async request<T>(path: string, init: RequestInit = {}) {
      const sentToken = token
      const sentEpoch = epoch
      const send = (value: string | undefined): Promise<T> => request<T>(path, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), ...(value ? { Authorization: `Bearer ${value}` } : {}) } })
      try { return await send(sentToken) } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || !sentToken) throw error
        await refresh(sentToken, sentEpoch)
        if (!token) throw error
        return send(token)
      }
    },
  }
  return controller
}


const defaultRequest: Requester = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(path, { ...init, credentials: 'include' })
  if (!response.ok) throw new ApiError(response.status)
  return response.json() as Promise<T>
}
