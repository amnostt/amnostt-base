import type { ApiResponse } from '../../core/http/api-client';
import type { Task } from './task-models';

export interface CreateTaskInput {
  title: string;
  description?: string;
  status: Task['status'];
  dueDate?: string;
}

export interface UpdateTaskInput {
  title: string;
  description?: string | null;
  status: Task['status'];
  dueDate?: string | null;
}

export interface TaskRepository {
  list(query: string, signal?: AbortSignal): Promise<ApiResponse<Task[]>>;
}

export function createTaskRepository(
  requestResponse: <T>(
    path: string,
    init?: RequestInit,
  ) => Promise<ApiResponse<T>>,
): TaskRepository {
  return {
    list: (query, signal) =>
      requestResponse<Task[]>(`/tasks${query}`, { signal }),
  };
}

export function createTask(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  input: CreateTaskInput,
): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateTask(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  id: string,
  input: UpdateTaskInput,
): Promise<Task> {
  return request<Task>(`/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteTask(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  id: string,
): Promise<void> {
  return request<void>(`/tasks/${id}`, { method: 'DELETE' });
}
