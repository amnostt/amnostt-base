import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '../../../core/http/api-client';
import { useSession } from './session-provider';

export function RegisterForm() {
  const { snapshot, register } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submitting = snapshot.status === 'register-submitting';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email.includes('@') || password.length < 12 || password.length > 128) {
      setError('Enter a valid email and a password between 12 and 128 characters.');
      return;
    }

    try {
      await register({ email, password });
      setPassword('');
    } catch (cause) {
      setPassword('');
      if (cause instanceof ApiError && cause.status === 409) {
        setError('An account with this email already exists.');
      } else if (cause instanceof ApiError && cause.status === 429) {
        setError('Too many registration attempts. Please try again later.');
      } else {
        setError('Unable to create your account. Please try again.');
      }
    }
  };

  return (
    <main className="mx-auto grid min-h-screen max-w-sm content-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold">Create account</h1>
        <p>Register a new account.</p>
      </div>
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-2">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="register-password">Password</Label>
          <Input
            id="register-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
