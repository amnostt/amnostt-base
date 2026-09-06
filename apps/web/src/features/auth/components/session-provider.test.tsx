import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SessionProvider, useSession } from './session-provider'
import { createSessionStore } from '../store/session-store'
import type { AuthRepository } from '../domain/auth-repository'
import type { CurrentUser } from '../domain/auth-models'

const auth: AuthRepository = {
  login: async () => { throw new Error() },
  restore: async () => { throw new Error() },
  refresh: async () => { throw new Error() },
  logout: async () => {},
}

describe('SessionProvider', () => {
  it('selects the store snapshot and keeps every public action stable', async () => {
    const user: CurrentUser = { id: '1', email: 'a@example.com', name: 'A', role: 'user', permissions: [] }
    const store = createSessionStore({ ...auth, login: async () => ({ accessToken: 'token', currentUser: user }) })
    const wrapper = ({ children }: { children: React.ReactNode }) => <SessionProvider store={store}>{children}</SessionProvider>
    const { result, rerender } = renderHook(() => useSession(), { wrapper })
    const initial = result.current
    const actions = [initial.bootstrap, initial.login, initial.logout]
    rerender()
    expect(result.current.store).toBe(store)
    expect(result.current.snapshot.status).toBe('bootstrap-loading')
    expect([result.current.bootstrap, result.current.login, result.current.logout]).toEqual(actions)
    await act(async () => { await result.current.login({ email: 'a@example.com', password: 'secret' }) })
    expect(result.current.snapshot).toEqual({ status: 'authenticated', user })
    expect(result.current.store).toBe(store)
    expect([result.current.bootstrap, result.current.login, result.current.logout]).toEqual(actions)
  })
})
