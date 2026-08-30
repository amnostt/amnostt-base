import { createContext, useContext, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { SessionController } from '../../lib/session-controller'

const SessionContext = createContext<SessionController | null>(null)

export function SessionProvider({ controller, children }: { controller: SessionController; children: ReactNode }) {
  return <SessionContext.Provider value={controller}>{children}</SessionContext.Provider>
}

// The hook and provider intentionally share one context boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const controller = useContext(SessionContext)
  if (!controller) throw new Error('useSession must be used within SessionProvider')
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  return useMemo(() => ({ controller, snapshot, bootstrap: controller.bootstrap, login: controller.login, logout: controller.logout }), [controller, snapshot])
}
