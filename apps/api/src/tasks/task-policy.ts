import { ForbiddenException } from '@nestjs/common';
import type { CurrentUser } from '../auth/auth.types';

export interface TaskListScope {
  ownerId?: string;
}

export interface TaskReadScope {
  id: string;
  ownerId?: string;
}

export function getTaskListScope(currentUser: CurrentUser): TaskListScope {
  assertTaskReadPermission(currentUser);
  return currentUser.permissions.includes('tasks:read:any')
    ? {}
    : { ownerId: currentUser.id };
}

export function getTaskReadScope(
  currentUser: CurrentUser,
  id: string,
): TaskReadScope {
  assertTaskReadPermission(currentUser);
  return currentUser.permissions.includes('tasks:read:any')
    ? { id }
    : { id, ownerId: currentUser.id };
}

export function assertTaskOwnerFilter(
  currentUser: CurrentUser,
  ownerId: string,
): void {
  if (
    ownerId !== currentUser.id &&
    !currentUser.permissions.includes('tasks:read:any')
  ) {
    throw new ForbiddenException('Insufficient permissions');
  }
}

function assertTaskReadPermission(currentUser: CurrentUser): void {
  if (!currentUser.permissions.includes('tasks:read:own')) {
    throw new ForbiddenException('Insufficient permissions');
  }
}
