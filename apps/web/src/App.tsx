import { useEffect } from 'react'
import { AuthenticatedShell } from './features/auth/components/authenticated-shell'
import { LoginForm } from './features/auth/components/login-form'
import { SessionLoading } from './features/auth/components/session-loading'
import { useSession } from './features/auth/components/session-provider'

function App() {
  const { snapshot, bootstrap } = useSession()
  useEffect(() => { void bootstrap() }, [bootstrap])
  if (snapshot.status === 'bootstrap-loading' || snapshot.status === 'request-refreshing' || snapshot.status === 'logout-pending') return <SessionLoading />
  if (snapshot.status === 'authenticated') return <AuthenticatedShell />
  return <LoginForm expired={snapshot.status === 'unauthenticated' && snapshot.notice === 'session-expired'} />
}

export default App
