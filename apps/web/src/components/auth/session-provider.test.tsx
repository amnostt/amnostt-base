import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SessionProvider, useSession } from './session-provider'
import { createSessionController } from '../../lib/session-controller'
import type { AuthApi } from '../../lib/auth-api'
import type { CurrentUser } from '../../lib/auth-types'

const auth: AuthApi = { login: async () => { throw new Error() }, me: async () => { throw new Error() }, refresh: async () => { throw new Error() }, logout: async () => {} }

describe('SessionProvider', () => {
  it('updates the snapshot while keeping every public action stable', async () => {
    const user: CurrentUser = { id: '1', email: 'a@example.com', name: 'A', role: 'user', permissions: [] }
    const controller = createSessionController({ ...auth, login: async () => ({ accessToken: 'token', currentUser: user }) })
    const wrapper = ({ children }: { children: React.ReactNode }) => <SessionProvider controller={controller}>{children}</SessionProvider>
    const { result, rerender } = renderHook(() => useSession(), { wrapper })
    const initial = result.current
    const actions = [initial.bootstrap, initial.login, initial.logout]
    rerender()
    expect(result.current.controller).toBe(initial.controller)
    expect(result.current.snapshot.status).toBe('bootstrap-loading')
    expect([result.current.bootstrap, result.current.login, result.current.logout]).toEqual(actions)
    await act(async () => { await result.current.login({ email: 'a@example.com', password: 'secret' }) })
    expect(result.current.snapshot).toEqual({ status: 'authenticated', user })
    expect(result.current.controller).toBe(initial.controller)
    expect([result.current.bootstrap, result.current.login, result.current.logout]).toEqual(actions)
  })
})
