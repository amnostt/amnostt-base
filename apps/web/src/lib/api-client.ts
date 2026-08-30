export class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Request failed')
    this.name = 'ApiError'
    this.status = status
  }
}
export interface ApiClient { request<T>(path: string, init?: RequestInit): Promise<T> }

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries())
}

export function createApiClient(baseUrl: string): ApiClient {
  return { async request<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { ...init, credentials: 'include', headers: normalizeHeaders(init.headers) })
    if (!response.ok) throw new ApiError(response.status)
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  } }
}
