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

export function getTaskUpdateScope(
  currentUser: CurrentUser,
  id: string,
): TaskReadScope {
  assertTaskUpdatePermission(currentUser);
  return currentUser.permissions.includes('tasks:update:any')
    ? { id }
    : { id, ownerId: currentUser.id };
}

export function getTaskDeleteScope(
  currentUser: CurrentUser,
  id: string,
): TaskReadScope {
  assertTaskDeletePermission(currentUser);
  return currentUser.permissions.includes('tasks:delete:any')
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

export function getTaskCreateOwnerId(
  currentUser: CurrentUser,
  requestedOwnerId?: string,
): string {
  const ownerId = requestedOwnerId ?? currentUser.id;
  const hasAnyPermission = currentUser.permissions.includes('tasks:create:any');
  const hasOwnPermission = currentUser.permissions.includes('tasks:create:own');

  if (
    (ownerId === currentUser.id && !hasOwnPermission && !hasAnyPermission) ||
    (ownerId !== currentUser.id && !hasAnyPermission)
  ) {
    throw new ForbiddenException('Insufficient permissions');
  }

  return ownerId;
}

function assertTaskReadPermission(currentUser: CurrentUser): void {
  if (!currentUser.permissions.includes('tasks:read:own')) {
    throw new ForbiddenException('Insufficient permissions');
  }
}

function assertTaskUpdatePermission(currentUser: CurrentUser): void {
  if (
    !currentUser.permissions.includes('tasks:update:own') &&
    !currentUser.permissions.includes('tasks:update:any')
  ) {
    throw new ForbiddenException('Insufficient permissions');
  }
}

function assertTaskDeletePermission(currentUser: CurrentUser): void {
  if (
    !currentUser.permissions.includes('tasks:delete:own') &&
    !currentUser.permissions.includes('tasks:delete:any')
  ) {
    throw new ForbiddenException('Insufficient permissions');
  }
}
