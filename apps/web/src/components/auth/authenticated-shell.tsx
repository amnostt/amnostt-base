import { Button } from '@/components/ui/button'
import { useSession } from './session-provider'

export function AuthenticatedShell() {
  const { snapshot, logout } = useSession()
  if (snapshot.status !== 'authenticated' && snapshot.status !== 'logout-pending') return null
  const user = snapshot.status === 'authenticated' ? snapshot.user : undefined
  return <main className="mx-auto grid min-h-screen max-w-lg content-center gap-4 p-8">
    <h1 className="text-3xl font-semibold">Welcome, {user?.name}</h1>
    <p>{user?.email}</p><p>Role: {user?.role}</p>
    <Button type="button" onClick={() => void logout()} disabled={snapshot.status === 'logout-pending'}>{snapshot.status === 'logout-pending' ? 'Logging out…' : 'Log out'}</Button>
  </main>
}
