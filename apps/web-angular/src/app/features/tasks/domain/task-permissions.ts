import type { CurrentUser } from '@/features/auth/domain/auth-models';
import type { Task } from './task-model';

export function canReadTasks(user: CurrentUser): boolean {
  return user.permissions.includes('tasks:read:own') || user.permissions.includes('tasks:read:any');
}

export function canCreateTasks(user: CurrentUser): boolean {
  return (
    user.permissions.includes('tasks:create:own') || user.permissions.includes('tasks:create:any')
  );
}

export function canUpdateTask(user: CurrentUser, task: Task): boolean {
  return (
    user.permissions.includes('tasks:update:any') ||
    (user.permissions.includes('tasks:update:own') && task.ownerId === user.id)
  );
}

export function canDeleteTask(user: CurrentUser, task: Task): boolean {
  return (
    user.permissions.includes('tasks:delete:any') ||
    (user.permissions.includes('tasks:delete:own') && task.ownerId === user.id)
  );
}
