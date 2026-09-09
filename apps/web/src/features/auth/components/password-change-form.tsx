import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '../../../core/http/api-client';
import { useSession } from './session-provider';

export function PasswordChangeForm() {
  const { changePassword } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess(false);
    if (!currentPassword || newPassword.length < 12 || newPassword.length > 128) {
      setError('Enter your current password and a new password between 12 and 128 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setSuccess(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setError('Your current password is incorrect.');
      } else {
        setError('Unable to change your password. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-sm gap-6">
      <div>
        <h1 className="text-3xl font-semibold">Change password</h1>
        <p>Replace your password while keeping this session active.</p>
      </div>
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </div>
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">Password updated.</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Changing password…' : 'Change password'}
        </Button>
      </form>
    </section>
  );
}
