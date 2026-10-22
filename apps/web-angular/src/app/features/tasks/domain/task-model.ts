import type { PaginatedResponse } from '@/core/http/pagination';

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status: TaskStatus;
  dueDate?: string;
}

export type TaskListResponse = PaginatedResponse<Task>;
