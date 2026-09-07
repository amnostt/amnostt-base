import type { ApiResponse } from '../../core/http/api-client'
import type { Task } from './task-models'

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
