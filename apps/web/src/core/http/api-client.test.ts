import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './api-client';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('api client', () => {
  it('decodes typed JSON and includes cookies and bearer credentials', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { value: 7 } }), { status: 200 }),
    );
    const client = createApiClient('https://example.test/api');

    await expect(
      client.request<{ value: number }>('/data', {
        headers: { Authorization: 'Bearer access-token' },
      }),
    ).resolves.toEqual({ value: 7 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/api/data',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('returns undefined for an empty 204 response', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      createApiClient('https://example.test').request('/logout'),
    ).resolves.toBeUndefined();
  });

  it('preserves collection metadata through the opt-in envelope request', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'task-1' }],
          meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
        }),
        { status: 200 },
      ),
    );

    await expect(
      createApiClient('https://example.test').requestResponse('/tasks'),
    ).resolves.toEqual({
      data: [{ id: 'task-1' }],
      meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });
  });

  it.each([
    ['Headers', new Headers({ Authorization: 'Bearer headers-token' })],
    ['tuples', [['Authorization', 'Bearer tuple-token']] as [string, string][]],
    ['object', { Authorization: 'Bearer object-token' }],
  ])('preserves %s HeadersInit entries', async (_, headers) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    );
    await createApiClient('https://example.test').request('/data', { headers });

    expect(fetchMock.mock.calls[0][1].headers).toEqual(
      expect.objectContaining({
        authorization: expect.stringContaining('Bearer'),
      }),
    );
  });

  it('preserves typed validation errors from the API envelope', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed',
            details: [{ field: 'email', code: 'INVALID_EMAIL' }],
          },
        }),
        { status: 400 },
      ),
    );
    const client = createApiClient('https://example.test/api');

    await expect(client.request('/data')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION_FAILED',
      details: [{ field: 'email', code: 'INVALID_EMAIL' }],
    });
  });

  it('omits details for non-validation API errors', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        }),
        { status: 401 },
      ),
    );

    const request = createApiClient('https://example.test').request('/data');
    await expect(request).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    await expect(request).rejects.not.toHaveProperty('details');
    await expect(request).rejects.toThrow(ApiError);
  });

  it.each([
    ['missing body', new Response(null, { status: 503 })],
    ['malformed JSON', new Response('{', { status: 502 })],
    [
      'missing error code',
      new Response(JSON.stringify({ error: { message: 'failed' } }), {
        status: 404,
      }),
    ],
    [
      'invalid error code',
      new Response(JSON.stringify({ error: { code: 42, message: 'failed' } }), {
        status: 422,
      }),
    ],
  ])(
    'falls back to HTTP_ERROR for %s while preserving status',
    async (_, response) => {
      fetchMock.mockResolvedValue(response);

      const request = createApiClient('https://example.test').request('/data');
      await expect(request).rejects.toMatchObject({
        name: 'ApiError',
        status: response.status,
        code: 'HTTP_ERROR',
      });
      await expect(request).rejects.not.toHaveProperty('details');
    },
  );
});
