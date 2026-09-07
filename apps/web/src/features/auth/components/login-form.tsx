import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSession } from './session-provider'
import { getSafeReturnPath } from '../../../routing'

export function LoginForm({ expired = false }: { expired?: boolean }) {
  const { snapshot, login } = useSession()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submitting = snapshot.status === 'login-submitting'
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!email.includes('@') || !password) {
      setError('Enter a valid email and password.')
      return
    }
    try { await login({ email, password }); setPassword(''); navigate(getSafeReturnPath(searchParams.get('returnTo')), { replace: true }) } catch { setPassword(''); setError('Unable to sign in. Check your credentials and try again.') }
  }
  return <main className="mx-auto grid min-h-screen max-w-sm content-center gap-6 p-8">
    <div><h1 className="text-3xl font-semibold">Sign in</h1>{expired && <p role="alert">Your session expired. Please sign in again.</p>}</div>
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div>
      <div className="grid gap-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  </main>
}
