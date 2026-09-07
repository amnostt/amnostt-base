export interface ValidationDetail {
  field: string
  code: string
}

export interface ApiSuccess<T> {
  data: T
}

export interface PaginationMeta {
  page: number
  limit: number
  totalItems: number
  totalPages: number
}

export interface ApiResponse<T> {
  data: T
  meta?: PaginationMeta
}

export interface ApiFailure {
  error: {
    code: string
    message: string
    details?: ValidationDetail[]
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  declare readonly details?: ValidationDetail[]

  constructor(
    status: number,
    code = 'HTTP_ERROR',
    details?: ValidationDetail[],
    message = 'Request failed',
  ) {
    super(message.trim() || 'Request failed')
    this.name = 'ApiError'
    this.status = status
    this.code = code
    if (details) this.details = details
  }
}

export interface ApiClient {
  request<T>(path: string, init?: RequestInit): Promise<T>
  requestResponse<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>>
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries())
}

export function createApiClient(baseUrl: string): ApiClient {
  const fetchResponse = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      credentials: 'include',
      headers: normalizeHeaders(init.headers),
    })
    if (response.status === 204) return undefined
    const body = await readJson(response)
    if (!response.ok) throw createApiError(response.status, body)
    return body
  }

  return {
    async request<T>(path: string, init: RequestInit = {}) {
      const body = await fetchResponse(path, init)
      if (body === undefined) return undefined as T
      return unwrapSuccess<T>(body)
    },
    async requestResponse<T>(path: string, init: RequestInit = {}) {
      const body = await fetchResponse(path, init)
      return (isRecord(body) && 'data' in body ? body : { data: body }) as unknown as ApiResponse<T>
    },
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function createApiError(status: number, body: unknown): ApiError {
  const failure = getFailure(body)
  if (!failure) return new ApiError(status)

  const details =
    failure.code === 'VALIDATION_FAILED'
      ? parseValidationDetails(failure.details)
      : undefined
  const message =
    typeof failure.message === 'string' && failure.message.trim()
      ? failure.message
      : 'Request failed'

  return new ApiError(status, failure.code, details, message)
}

function getFailure(body: unknown): {
  code: string
  message?: unknown
  details?: unknown
} | undefined {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.code !== 'string') {
    return undefined
  }

  const code = body.error.code.trim()
  return code ? { code, message: body.error.message, details: body.error.details } : undefined
}

function parseValidationDetails(value: unknown): ValidationDetail[] | undefined {
  if (!Array.isArray(value)) return undefined

  const details = value.filter(
    (detail): detail is ValidationDetail =>
      isRecord(detail) &&
      typeof detail.field === 'string' &&
      detail.field.trim().length > 0 &&
      typeof detail.code === 'string' &&
      detail.code.trim().length > 0,
  )
  return details.length === value.length && details.length > 0 ? details : undefined
}

function unwrapSuccess<T>(body: unknown): T {
  if (isRecord(body) && 'data' in body) return body.data as T
  return body as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
