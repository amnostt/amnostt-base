export type TaskRowAction = 'update' | 'delete';

interface TaskUser {
  id: string;
  permissions: string[];
}

export function canShowTaskRowAction(
  user: TaskUser,
  action: TaskRowAction,
  ownerId: string,
): boolean {
  return (
    user.permissions.includes(`tasks:${action}:any`) ||
    (user.permissions.includes(`tasks:${action}:own`) && ownerId === user.id)
  );
}
