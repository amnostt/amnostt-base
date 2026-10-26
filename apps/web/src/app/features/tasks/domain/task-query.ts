import type { TaskStatus } from './task-model';

export type TaskSortField = 'createdAt' | 'updatedAt' | 'dueDate' | 'title';

export type TaskSort = TaskSortField | `-${TaskSortField}`;

export interface TaskQueryState {
  search: string;
  status: TaskStatus | '';
  ownerId: string;
  dueDate: string;
  sort: TaskSort;
  page: number;
  limit: number;
}

export type TaskQueryChanges = Partial<TaskQueryState>;

export const TASK_QUERY_DEFAULTS: TaskQueryState = {
  search: '',
  status: '',
  ownerId: '',
  dueDate: '',
  sort: '-createdAt',
  page: 1,
  limit: 20,
};

const taskStatuses = new Set<string>(['pending', 'in_progress', 'completed']);

const taskSortFields: TaskSortField[] = ['createdAt', 'updatedAt', 'dueDate', 'title'];

const taskSorts = new Set<string>(taskSortFields.flatMap((field) => [field, `-${field}`]));

export function parseTaskQuery(search: string): TaskQueryState {
  const params = new URLSearchParams(search);
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? '';
  const dueDate = params.get('dueDate') ?? '';

  return {
    search: params.get('search')?.trim() ?? TASK_QUERY_DEFAULTS.search,
    status: taskStatuses.has(status) ? (status as TaskStatus) : TASK_QUERY_DEFAULTS.status,
    ownerId: params.get('ownerId')?.trim() ?? TASK_QUERY_DEFAULTS.ownerId,
    dueDate: isValidCalendarDate(dueDate) ? dueDate : TASK_QUERY_DEFAULTS.dueDate,
    sort: taskSorts.has(sort) ? (sort as TaskSort) : TASK_QUERY_DEFAULTS.sort,
    page: parseBoundedInteger(
      params.get('page'),
      TASK_QUERY_DEFAULTS.page,
      Number.MAX_SAFE_INTEGER,
    ),
    limit: parseBoundedInteger(params.get('limit'), TASK_QUERY_DEFAULTS.limit, 100),
  };
}

export function serializeTaskQuery(query: TaskQueryState): string {
  const params = new URLSearchParams();

  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.ownerId) params.set('ownerId', query.ownerId);
  if (query.dueDate) params.set('dueDate', query.dueDate);

  if (query.sort !== TASK_QUERY_DEFAULTS.sort) {
    params.set('sort', query.sort);
  }

  if (query.page !== TASK_QUERY_DEFAULTS.page) {
    params.set('page', String(query.page));
  }

  if (query.limit !== TASK_QUERY_DEFAULTS.limit) {
    params.set('limit', String(query.limit));
  }

  const serialized = params.toString();

  return serialized ? `?${serialized}` : '';
}

export function updateTaskQuery(search: string, changes: TaskQueryChanges): string {
  const current = parseTaskQuery(search);

  const criteriaKeys = ['search', 'status', 'ownerId', 'dueDate', 'sort', 'limit'];

  const shouldResetPage = criteriaKeys.some((key) => key in changes);

  return serializeTaskQuery({
    ...current,
    ...changes,
    page: shouldResetPage ? TASK_QUERY_DEFAULTS.page : (changes.page ?? current.page),
  });
}

function parseBoundedInteger(value: string | null, fallback: number, max: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;

  const parsed = Number(value);

  return parsed >= 1 && parsed <= max ? parsed : fallback;
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
