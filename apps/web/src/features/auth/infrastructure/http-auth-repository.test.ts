import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../../core/http/api-client';
import { HttpAuthRepository } from './http-auth-repository';

const user = {
  id: '1',
  email: 'a@example.com',
  name: 'A',
  role: 'user',
  permissions: [],
};

describe('HttpAuthRepository', () => {
  it('maps payload-only responses through the authentication lifecycle', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: 'token', currentUser: user })
      .mockResolvedValueOnce({ accessToken: 'registered-token', currentUser: user })
      .mockResolvedValueOnce({ accessToken: 'refresh-token' })
      .mockResolvedValueOnce({ currentUser: user })
      .mockResolvedValueOnce(undefined);
    const repository = new HttpAuthRepository({
      request: request as ApiClient['request'],
      requestResponse: vi.fn(),
    });

    await expect(
      repository.login({ email: 'a@example.com', password: 'secret' }),
    ).resolves.toEqual({
      accessToken: 'token',
      currentUser: user,
    });
    await expect(
      repository.register({ email: 'new@example.com', password: 'a'.repeat(12) }),
    ).resolves.toEqual({
      accessToken: 'registered-token',
      currentUser: user,
    });
    await expect(repository.restore()).resolves.toEqual({
      accessToken: 'refresh-token',
      currentUser: user,
    });
    await repository.logout();

    expect(
      request.mock.calls.map(([path, init]) => [path, init?.method]),
    ).toEqual([
      ['/auth/login', 'POST'],
      ['/auth/register', 'POST'],
      ['/auth/refresh', 'POST'],
      ['/auth/me', 'GET'],
      ['/auth/logout', 'POST'],
    ]);
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toEqual({
      email: 'a@example.com',
      password: 'secret',
    });
    expect(JSON.parse(request.mock.calls[1][1]?.body as string)).toEqual({
      email: 'new@example.com',
      password: 'a'.repeat(12),
    });
    expect(request.mock.calls[0][1]?.headers).toEqual({
      'Content-Type': 'application/json',
    });
    expect(request.mock.calls[3][1]?.headers).toEqual({
      Authorization: 'Bearer refresh-token',
    });
  });
});
