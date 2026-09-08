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
