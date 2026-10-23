import { AuthenticatedApiClient } from '@/core/http/authenticated-api-client';
import { inject, Service } from '@angular/core';
import type {
  CreateTaskInput,
  Task,
  TaskListResponse,
  UpdateTaskInput,
} from '../domain/task-model';
import { serializeTaskQuery, TASK_QUERY_DEFAULTS, type TaskQueryState } from '../domain/task-query';

@Service()
export class TasksApi {
  private readonly client = inject(AuthenticatedApiClient);

  list(query: TaskQueryState = TASK_QUERY_DEFAULTS): Promise<TaskListResponse> {
    const search = serializeTaskQuery(query);

    return this.client.get<TaskListResponse>(`/tasks${search}`);
  }

  create(input: CreateTaskInput): Promise<Task> {
    return this.client.post<Task>('/tasks', input);
  }

  update(id: string, input: UpdateTaskInput): Promise<Task> {
    return this.client.patch<Task>(`/tasks/${id}`, input);
  }
}
