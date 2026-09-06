import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from './api-client'

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
