import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router'
import { AuthenticatedShell } from './features/auth/components/authenticated-shell'
import { LoginForm } from './features/auth/components/login-form'
import { SessionLoading } from './features/auth/components/session-loading'
import { useSession } from './features/auth/components/session-provider'
import { TaskListPage } from './features/tasks/task-list-page'
import { getLoginRedirect, getSafeReturnPath } from './routing'

function HomePage() {
  const { snapshot } = useSession()
  const user = snapshot.status === 'authenticated' ? snapshot.user : undefined
  return <section className="grid gap-3"><h1 className="text-3xl font-semibold">Welcome, {user?.name}</h1><p>{user?.email}</p><p>Role: {user?.role}</p></section>
}

function ForbiddenPage() {
  return <section className="grid gap-3" role="alert"><h1 className="text-3xl font-semibold">403</h1><p>You do not have permission to view this page.</p></section>
}

function NotFoundPage() {
  return <section className="grid gap-3" role="alert"><h1 className="text-3xl font-semibold">404</h1><p>Page not found.</p></section>
}

function TaskRoute() {
  const { snapshot } = useSession()
  if (snapshot.status !== 'authenticated') return null
  const canRead = snapshot.user.permissions.includes('tasks:read:own')
  return canRead ? <TaskListPage /> : <ForbiddenPage />
}

function AuthenticatedLoginRedirect() {
  const [searchParams] = useSearchParams()
  return <Navigate to={getSafeReturnPath(searchParams.get('returnTo'))} replace />
}

function AuthenticatedRoutes() {
  return <Routes><Route element={<AuthenticatedShell />}><Route path="/" element={<HomePage />} /><Route path="/tasks" element={<TaskRoute />} /><Route path="/tasks/new" element={<TaskRoute />} /><Route path="/403" element={<ForbiddenPage />} /><Route path="/login" element={<AuthenticatedLoginRedirect />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes>
}

function AppRoutes() {
  const { snapshot } = useSession()
  const location = useLocation()
  if (snapshot.status === 'bootstrap-loading' || snapshot.status === 'request-refreshing' || snapshot.status === 'logout-pending') return <SessionLoading />
  if (snapshot.status === 'authenticated') return <AuthenticatedRoutes />
  const requestedPath = `${location.pathname}${location.search}${location.hash}`
  return <Routes><Route path="/login" element={<LoginForm expired={snapshot.status === 'unauthenticated' && snapshot.notice === 'session-expired'} />} /><Route path="*" element={<Navigate to={getLoginRedirect(requestedPath)} replace />} /></Routes>
}

function App() {
  const { bootstrap } = useSession()
  useEffect(() => { void bootstrap() }, [bootstrap])
  return <BrowserRouter><AppRoutes /></BrowserRouter>
}

export default App
