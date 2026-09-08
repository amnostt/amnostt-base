import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../core/http/api-client';
import type { AuthRepository } from '../domain/auth-repository';
import type { CurrentUser } from '../domain/auth-models';
import { createSessionStore } from './session-store';

const user: CurrentUser = {
  id: '1',
  email: 'a@example.com',
  name: 'A',
  role: 'user',
  permissions: [],
};
const api = (overrides: Partial<AuthRepository> = {}): AuthRepository => ({
  login: vi
    .fn()
    .mockResolvedValue({ accessToken: 'login-token', currentUser: user }),
  restore: vi
    .fn()
    .mockResolvedValue({ accessToken: 'restore-token', currentUser: user }),
  refresh: vi.fn().mockResolvedValue('refresh-token'),
  logout: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('SessionStore', () => {
  it('bootstraps idempotently through restore and logs in without another identity request', async () => {
    const auth = api();
    const store = createSessionStore(auth);
    await Promise.all([
      store.getState().bootstrap(),
      store.getState().bootstrap(),
    ]);
    expect(auth.restore).toHaveBeenCalledOnce();
    expect(store.getState().snapshot).toEqual({
      status: 'authenticated',
      user,
    });

    await store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });
    expect(auth.login).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'secret',
    });
    expect(auth.restore).toHaveBeenCalledOnce();
  });

  it('shares refresh, retries each request once, and handles a changed token race', async () => {
    let rejectRefresh!: (error: Error) => void;
    const refresh = vi.fn().mockReturnValue(
      new Promise<string>((_, reject) => {
        rejectRefresh = reject;
      }),
    );
    const auth = api({ refresh });
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(401))
      .mockRejectedValueOnce(new ApiError(401))
      .mockResolvedValue({ value: 1 });
    const store = createSessionStore(
      auth,
      async <T>(path: string, init?: RequestInit) =>
        request(path, init) as Promise<T>,
    );
    await store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });
    const first = store.getState().request('/one');
    const second = store.getState().request('/two');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(auth.refresh).toHaveBeenCalledOnce();
    rejectRefresh(new Error('expired'));
    await expect(first).rejects.toThrow('expired');
    await expect(second).rejects.toThrow('expired');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('publishes refreshing while refresh is pending and retries successfully', async () => {
    let resolveRefresh!: (value: string) => void;
    const auth = api({
      refresh: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    });
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(401))
      .mockResolvedValue({ value: 2 });
    const store = createSessionStore(
      auth,
      async <T>(path: string, init?: RequestInit) =>
        request(path, init) as Promise<T>,
    );
    await store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });
    const pending = store.getState().request('/data');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getState().snapshot).toEqual({ status: 'request-refreshing' });
    resolveRefresh('new-token');
    await expect(pending).resolves.toEqual({ value: 2 });
  });

  it('does not let stale refresh or login completions restore state after logout', async () => {
    let resolveLogin!: (
      value: Awaited<ReturnType<AuthRepository['login']>>,
    ) => void;
    const auth = api({
      login: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<AuthRepository['login']>>>(
            (resolve) => {
              resolveLogin = resolve;
            },
          ),
      ),
    });
    const store = createSessionStore(auth);
    const login = store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });
    await store.getState().logout();
    resolveLogin({ accessToken: 'stale', currentUser: user });
    await login;
    expect(store.getState().snapshot).toEqual({ status: 'unauthenticated' });
  });

  it('does not let an older rejected login erase a newer authenticated session', async () => {
    let rejectOldLogin!: (error: Error) => void;
    const auth = api({
      login: vi
        .fn()
        .mockReturnValueOnce(
          new Promise((_, reject) => {
            rejectOldLogin = reject;
          }),
        )
        .mockResolvedValueOnce({ accessToken: 'new-token', currentUser: user }),
    });
    const store = createSessionStore(auth);

    const oldLogin = store
      .getState()
      .login({ email: 'old@example.com', password: 'wrong' });
    await store.getState().logout();
    await store
      .getState()
      .login({ email: 'new@example.com', password: 'secret' });
    rejectOldLogin(new Error('invalid credentials'));

    await expect(oldLogin).rejects.toThrow(ApiError);
    expect(store.getState().snapshot).toEqual({
      status: 'authenticated',
      user,
    });
  });

  it('shows session-expired only for a post-auth refresh failure and never uses an empty token', async () => {
    const auth = api({
      refresh: vi.fn().mockRejectedValue(new Error('expired')),
    });
    const store = createSessionStore(auth, async <T>(path: string) => {
      void path;
      throw new ApiError(401) as T;
    });
    await store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });
    await expect(store.getState().request('/data')).rejects.toThrow('expired');
    expect(store.getState().snapshot).toEqual({
      status: 'unauthenticated',
      notice: 'session-expired',
    });
  });

  it('shares a successful refresh and retries every concurrent request', async () => {
    let resolveRefresh!: (value: string) => void;
    const auth = api({
      refresh: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    });
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(401))
      .mockRejectedValueOnce(new ApiError(401))
      .mockResolvedValueOnce({ value: 'one' })
      .mockResolvedValueOnce({ value: 'two' });
    const store = createSessionStore(
      auth,
      async <T>(path: string, init?: RequestInit) =>
        request(path, init) as Promise<T>,
    );
    await store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });

    const first = store.getState().request('/one');
    const second = store.getState().request('/two');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(auth.refresh).toHaveBeenCalledOnce();
    resolveRefresh('new-token');

    await expect(first).resolves.toEqual({ value: 'one' });
    await expect(second).resolves.toEqual({ value: 'two' });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('clears local state on logout even when remote logout fails', async () => {
    const auth = api({
      logout: vi.fn().mockRejectedValue(new Error('offline')),
    });
    const store = createSessionStore(auth);
    await store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });
    await store.getState().logout();
    expect(store.getState().snapshot).toEqual({ status: 'unauthenticated' });
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it('does not refresh or retry after the retry request also returns 401', async () => {
    const auth = api({ refresh: vi.fn().mockResolvedValue('new-token') });
    const request = vi.fn().mockRejectedValue(new ApiError(401));
    const store = createSessionStore(
      auth,
      async <T>(path: string, init?: RequestInit) =>
        request(path, init) as Promise<T>,
    );
    await store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });
    await expect(store.getState().request('/data')).rejects.toThrow(ApiError);
    expect(auth.refresh).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('ignores a refresh completed after logout without retrying', async () => {
    const pending = deferred<string>();
    const auth = api({ refresh: vi.fn(() => pending.promise) });
    const request = vi.fn().mockRejectedValue(new ApiError(401));
    const store = createSessionStore(
      auth,
      async <T>(path: string, init?: RequestInit) =>
        request(path, init) as Promise<T>,
    );
    await store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });
    const failed = store.getState().request('/data');
    await store.getState().logout();
    pending.resolve('stale-token');
    await expect(failed).rejects.toThrow(ApiError);
    expect(request).toHaveBeenCalledOnce();
    expect(store.getState().snapshot).toEqual({ status: 'unauthenticated' });
  });

  it('does not reuse a refresh pending before logout for a new login session', async () => {
    const oldRefresh = deferred<string>();
    const newRefresh = deferred<string>();
    const auth = api({
      refresh: vi
        .fn()
        .mockReturnValueOnce(oldRefresh.promise)
        .mockReturnValueOnce(newRefresh.promise),
    });
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(401))
      .mockRejectedValueOnce(new ApiError(401))
      .mockResolvedValueOnce({ value: 'new-session' })
      .mockRejectedValueOnce(new ApiError(401));
    const store = createSessionStore(
      auth,
      async <T>(path: string, init?: RequestInit) =>
        request(path, init) as Promise<T>,
    );

    await store
      .getState()
      .login({ email: 'old@example.com', password: 'secret' });
    const oldRequest = store.getState().request('/old-session');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await store.getState().logout();
    await store
      .getState()
      .login({ email: 'new@example.com', password: 'secret' });

    const newRequest = store.getState().request('/new-session');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(auth.refresh).toHaveBeenCalledTimes(2);

    newRefresh.resolve('new-refresh-token');
    await expect(newRequest).resolves.toEqual({ value: 'new-session' });
    oldRefresh.resolve('stale-refresh-token');
    await expect(oldRequest).rejects.toThrow(ApiError);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('does not let a stale refresh overwrite a new login token or identity', async () => {
    const pending = deferred<string>();
    const newUser = { ...user, id: '2', email: 'new@example.com' };
    const auth = api({
      refresh: vi.fn(() => pending.promise),
      login: vi.fn().mockResolvedValue({
        accessToken: 'new-login-token',
        currentUser: newUser,
      }),
    });
    const request = vi.fn().mockRejectedValue(new ApiError(401));
    const store = createSessionStore(
      auth,
      async <T>(path: string, init?: RequestInit) =>
        request(path, init) as Promise<T>,
    );
    await store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });
    const failed = store.getState().request('/data');
    await store
      .getState()
      .login({ email: 'new@example.com', password: 'secret' });
    pending.resolve('stale-refresh-token');
    await expect(failed).rejects.toThrow(ApiError);
    expect(store.getState().snapshot).toEqual({
      status: 'authenticated',
      user: newUser,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].headers.Authorization).toBe(
      'Bearer new-login-token',
    );
  });

  it('silently returns unauthenticated when bootstrap restore fails with 401', async () => {
    const auth = api({ restore: vi.fn().mockRejectedValue(new ApiError(401)) });
    const store = createSessionStore(auth);
    await store.getState().bootstrap();
    expect(store.getState().snapshot).toEqual({ status: 'unauthenticated' });
  });

  it('refreshes from an enriched unauthorized error without reading its message', async () => {
    const auth = api({ refresh: vi.fn().mockResolvedValue('new-token') });
    const request = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          401,
          'UNAUTHORIZED',
          [{ field: 'session', code: 'EXPIRED' }],
          'backend-specific wording',
        ),
      )
      .mockResolvedValueOnce({ value: 'retried' });
    const store = createSessionStore(
      auth,
      async <T>(path: string, init?: RequestInit) =>
        request(path, init) as Promise<T>,
    );

    await store
      .getState()
      .login({ email: 'a@example.com', password: 'secret' });

    await expect(store.getState().request('/data')).resolves.toEqual({
      value: 'retried',
    });
    expect(auth.refresh).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
