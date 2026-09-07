import type { ApiResponse } from '../../core/http/api-client'
import type { Task } from './task-models'

export interface CreateTaskInput {
  title: string
  description?: string
  status: Task['status']
  dueDate?: string
}

export interface TaskRepository {
  list(query: string): Promise<ApiResponse<Task[]>>
}

export function createTaskRepository(
  requestResponse: <T>(path: string, init?: RequestInit) => Promise<ApiResponse<T>>,
): TaskRepository {
  return {
    list: (query) => requestResponse<Task[]>(`/tasks${query}`),
  }
}

export function createTask(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
  input: CreateTaskInput,
): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
