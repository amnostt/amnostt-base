import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import type { SessionStore } from '../store/session-state'
import {
  selectBootstrap,
  selectLogin,
  selectLogout,
  selectRequest,
  selectRequestResponse,
  selectSessionSnapshot,
} from '../store/session-selectors'

export type SessionStoreApi = StoreApi<SessionStore>

const SessionContext = createContext<SessionStoreApi | null>(null)

export function SessionProvider({ store, children }: { store: SessionStoreApi; children: ReactNode }) {
  return <SessionContext.Provider value={store}>{children}</SessionContext.Provider>
}

// The hook and provider intentionally share one context boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const store = useContext(SessionContext)
  if (!store) throw new Error('useSession must be used within SessionProvider')
  const snapshot = useStore(store, selectSessionSnapshot)
  const bootstrap = useStore(store, selectBootstrap)
  const login = useStore(store, selectLogin)
  const logout = useStore(store, selectLogout)
  const request = useStore(store, selectRequest)
  const requestResponse = useStore(store, selectRequestResponse)

  return {
    store,
    snapshot,
    bootstrap,
    login,
    logout,
    request,
    requestResponse,
  }
}
