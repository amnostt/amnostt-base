import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from './api-client'
import { createAuthApi } from './auth-api'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('api client', () => {
  it('decodes typed JSON and includes cookies and bearer credentials', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ value: 7 }), { status: 200 }))
    const client = createApiClient('https://example.test/api')

    await expect(client.request<{ value: number }>('/data', {
      headers: { Authorization: 'Bearer access-token' },
    })).resolves.toEqual({ value: 7 })
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/data', expect.objectContaining({
      credentials: 'include',
       headers: expect.objectContaining({ authorization: 'Bearer access-token' }),
    }))
  })

  it.each([
    ['Headers', new Headers({ Authorization: 'Bearer headers-token' })],
    ['tuples', [['Authorization', 'Bearer tuple-token']] as [string, string][]],
    ['object', { Authorization: 'Bearer object-token' }],
  ])('preserves %s HeadersInit entries', async (_, headers) => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    await createApiClient('https://example.test').request('/data', { headers })

    expect(fetchMock.mock.calls[0][1].headers).toEqual(
      expect.objectContaining({ authorization: expect.stringContaining('Bearer') }),
    )
  })

  it('normalizes failed responses without exposing backend details', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'stack trace' }), { status: 503 }))
    const client = createApiClient('https://example.test/api')

    await expect(client.request('/data')).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: 'Request failed',
    })
  })
})

describe('auth api', () => {
  it('maps auth endpoint methods to the API contract', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'token', currentUser: { id: '1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ currentUser: { id: '1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'new-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const auth = createAuthApi(createApiClient('https://example.test/api'))

    await auth.login({ email: 'a@example.com', password: 'secret' })
    await auth.me('token')
    await auth.refresh()
    await auth.logout()

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['https://example.test/api/auth/login', 'POST'],
      ['https://example.test/api/auth/me', 'GET'],
      ['https://example.test/api/auth/refresh', 'POST'],
      ['https://example.test/api/auth/logout', 'POST'],
    ])
    const calls = fetchMock.mock.calls.map(([, init]) => init)
    expect(JSON.parse(calls[0].body)).toEqual({ email: 'a@example.com', password: 'secret' })
    expect(calls[0].headers).toEqual(expect.objectContaining({ 'content-type': 'application/json' }))
    expect(calls[1].headers).toEqual(expect.objectContaining({ authorization: 'Bearer token' }))
    expect(calls[2].credentials).toBe('include')
    expect(calls[3].credentials).toBe('include')
  })

  it('returns mapped login and me payloads', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'token', currentUser: { id: '1' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ currentUser: { id: '2' } })))
    const auth = createAuthApi(createApiClient('https://example.test/api'))

    await expect(auth.login({ email: 'a@example.com', password: 'secret' })).resolves.toMatchObject({ accessToken: 'token' })
    await expect(auth.me('token')).resolves.toEqual({ id: '2' })
  })
})
