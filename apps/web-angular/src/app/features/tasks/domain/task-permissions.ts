import type { CurrentUser } from '@/features/auth/domain/auth-models';

export function canReadTasks(user: CurrentUser): boolean {
  return user.permissions.includes('tasks:read:own') || user.permissions.includes('tasks:read:any');
}

export function canCreateTasks(user: CurrentUser): boolean {
  return (
    user.permissions.includes('tasks:create:own') || user.permissions.includes('tasks:create:any')
  );
}
