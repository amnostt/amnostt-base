import type { TaskStatus } from './task-models'

export const TASK_QUERY_DEFAULTS = {
  search: '',
  status: '',
  ownerId: '',
  dueDate: '',
  sort: '-createdAt',
  page: 1,
  limit: 20,
} as const

export const TASK_SORT_OPTIONS = [
  { value: '-createdAt', label: 'Newest first' },
  { value: 'createdAt', label: 'Oldest first' },
  { value: '-updatedAt', label: 'Recently updated' },
  { value: 'updatedAt', label: 'Least recently updated' },
  { value: '-dueDate', label: 'Latest due date' },
  { value: 'dueDate', label: 'Earliest due date' },
  { value: '-title', label: 'Title Z-A' },
  { value: 'title', label: 'Title A-Z' },
] as const

export const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
]

export type TaskSort = (typeof TASK_SORT_OPTIONS)[number]['value']

export interface TaskQueryState {
  search: string
  status: TaskStatus | ''
  ownerId: string
  dueDate: string
  sort: TaskSort
  page: number
  limit: number
}

export type TaskQueryChanges = Partial<TaskQueryState>

const taskSorts = new Set<string>(TASK_SORT_OPTIONS.map(({ value }) => value))
const taskStatuses = new Set<string>(TASK_STATUS_OPTIONS.map(({ value }) => value))

export function parseTaskQuery(search: string): TaskQueryState {
  const params = new URLSearchParams(search)
  const status = params.get('status') ?? ''
  const sort = params.get('sort') ?? ''

  return {
    search: params.get('search')?.trim() ?? TASK_QUERY_DEFAULTS.search,
    status: taskStatuses.has(status) ? (status as TaskStatus) : TASK_QUERY_DEFAULTS.status,
    ownerId: params.get('ownerId')?.trim() ?? TASK_QUERY_DEFAULTS.ownerId,
    dueDate: isValidCalendarDate(params.get('dueDate') ?? '') ? params.get('dueDate')! : TASK_QUERY_DEFAULTS.dueDate,
    sort: taskSorts.has(sort) ? (sort as TaskSort) : TASK_QUERY_DEFAULTS.sort,
    page: parseBoundedInteger(params.get('page'), 1, Number.MAX_SAFE_INTEGER),
    limit: parseBoundedInteger(params.get('limit'), 20, 100),
  }
}

export function serializeTaskQuery(query: TaskQueryState): string {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.status) params.set('status', query.status)
  if (query.ownerId) params.set('ownerId', query.ownerId)
  if (query.dueDate) params.set('dueDate', query.dueDate)
  if (query.sort !== TASK_QUERY_DEFAULTS.sort) params.set('sort', query.sort)
  if (query.page !== TASK_QUERY_DEFAULTS.page) params.set('page', String(query.page))
  if (query.limit !== TASK_QUERY_DEFAULTS.limit) params.set('limit', String(query.limit))

  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

export function updateTaskQuery(
  search: string,
  changes: TaskQueryChanges,
): string {
  const current = parseTaskQuery(search)
  const changesCriteria = ['search', 'status', 'ownerId', 'dueDate', 'sort', 'limit']
  const shouldResetPage = changesCriteria.some((key) => key in changes)
  return serializeTaskQuery({
    ...current,
    ...changes,
    page: shouldResetPage ? 1 : changes.page ?? current.page,
  })
}

function parseBoundedInteger(value: string | null, fallback: number, max: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback
  const parsed = Number(value)
  return parsed >= 1 && parsed <= max ? parsed : fallback
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
}
