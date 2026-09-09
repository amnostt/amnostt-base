import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '../../../core/http/api-client';
import { HttpAuthRepository } from '../infrastructure/http-auth-repository';
import { createSessionStore } from '../store/session-store';
import { PasswordChangeForm } from './password-change-form';
import { SessionProvider } from './session-provider';

const user = {
  id: '1',
  email: 'a@example.com',
  name: 'A',
  role: 'user',
  permissions: [],
};
const failure = (message: string) =>
  new Response(
    JSON.stringify({
      error: { code: 'UNAUTHORIZED', message },
    }),
    { status: 401 },
  );

async function setup(responses: Response[]) {
  const fetchMock = vi.fn().mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        data: { accessToken: 'current-token', currentUser: user },
      }),
    ),
  );
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetchMock);
  const client = createApiClient('https://api.example.test/api');
  const store = createSessionStore(
    new HttpAuthRepository(client),
    client.request,
    client.requestResponse,
  );
  await store.getState().login({ email: user.email, password: 'secret' });
  render(
    <SessionProvider store={store}>
      <PasswordChangeForm />
    </SessionProvider>,
  );
  const actor = userEvent.setup();
  await actor.type(
    screen.getByLabelText('Current password'),
    'current-password',
  );
  await actor.type(screen.getByLabelText('New password'), 'new-password-123');
  await actor.click(screen.getByRole('button', { name: 'Change password' }));
  return { fetchMock, store };
}

const refreshed = () =>
  new Response(JSON.stringify({ data: { accessToken: 'new-token' } }));
const success = () => new Response(null, { status: 204 });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('password change HTTP boundary', () => {
  it('sends the current in-memory token and keeps cookie credentials', async () => {
    const { fetchMock, store } = await setup([success()]);
    expect(await screen.findByText('Password updated.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.example.test/api/auth/password');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer current-token',
    );
    expect(new Headers(init.headers).get('content-type')).toBe(
      'application/json',
    );
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({
      currentPassword: 'current-password',
      newPassword: 'new-password-123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.getState().snapshot).toEqual({
      status: 'authenticated',
      user,
    });
  });

  it('refreshes once and retries the same password request with the new token', async () => {
    const { fetchMock } = await setup([
      failure('Unauthorized'),
      refreshed(),
      success(),
    ]);
    expect(await screen.findByText('Password updated.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/auth/login',
      'https://api.example.test/api/auth/password',
      'https://api.example.test/api/auth/refresh',
      'https://api.example.test/api/auth/password',
    ]);
    expect(fetchMock.mock.calls[2][1].credentials).toBe('include');
    expect(
      new Headers(fetchMock.mock.calls[2][1].headers).has('authorization'),
    ).toBe(false);
    expect(
      new Headers(fetchMock.mock.calls[3][1].headers).get('authorization'),
    ).toBe('Bearer new-token');
    expect(fetchMock.mock.calls[3][1].body).toBe(
      fetchMock.mock.calls[1][1].body,
    );
  });

  it('maps a true invalid current password without refreshing or clearing the session', async () => {
    const { fetchMock, store } = await setup([
      failure('Invalid current password'),
    ]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your current password is incorrect.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetchMock.mock.calls[1][1].headers).get('authorization'),
    ).toBe('Bearer current-token');
    expect(store.getState().snapshot).toEqual({
      status: 'authenticated',
      user,
    });
  });

  it('does not mistake refresh failure for an incorrect password', async () => {
    const { fetchMock, store } = await setup([
      failure('Unauthorized'),
      failure('Unauthorized'),
    ]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to change your password. Please try again.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(store.getState().snapshot).toEqual({
      status: 'unauthenticated',
      notice: 'session-expired',
    });
  });

  it('does not refresh again after the retry is unauthorized', async () => {
    const { fetchMock } = await setup([
      failure('Unauthorized'),
      refreshed(),
      failure('Unauthorized'),
    ]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to change your password. Please try again.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('maps an invalid current password returned after successful refresh', async () => {
    const { fetchMock } = await setup([
      failure('Unauthorized'),
      refreshed(),
      failure('Invalid current password'),
    ]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your current password is incorrect.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
