import { useEffect } from 'react'
import { AuthenticatedShell } from './components/auth/authenticated-shell'
import { LoginForm } from './components/auth/login-form'
import { SessionLoading } from './components/auth/session-loading'
import { useSession } from './components/auth/session-provider'

function App() {
  const { snapshot, bootstrap } = useSession()
  useEffect(() => { void bootstrap() }, [bootstrap])
  if (snapshot.status === 'bootstrap-loading' || snapshot.status === 'request-refreshing' || snapshot.status === 'logout-pending') return <SessionLoading />
  if (snapshot.status === 'authenticated') return <AuthenticatedShell />
  return <LoginForm expired={snapshot.status === 'unauthenticated' && snapshot.notice === 'session-expired'} />
}

export default App
