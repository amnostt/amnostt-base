import { describe, expect, it } from 'vitest';
import type { CurrentUser } from '@/features/auth/domain/auth-models';
import type { Task } from './task-model';
import { canCreateTasks, canDeleteTask, canUpdateTask } from './task-permissions';

function currentUser(permissions: string[], role = 'Viewer'): CurrentUser {
  return {
    id: 'example-user-id',
    email: 'example@example.com',
    name: 'Example User',
    role,
    permissions,
  };
}

describe('canCreateTasks', () => {
  it.each(['tasks:create:own', 'tasks:create:any'])(
    'allows creation with %s independently of the role name',
    (permission) => {
      expect(canCreateTasks(currentUser([permission]))).toBe(true);
    },
  );

  it.each(['tasks:read:own', 'tasks:read:any'])(
    'does not treat %s as permission to create',
    (permission) => {
      expect(canCreateTasks(currentUser([permission]))).toBe(false);
    },
  );

  it('does not grant creation to an Admin without a create permission', () => {
    expect(canCreateTasks(currentUser([], 'Admin'))).toBe(false);
  });
});

describe('canUpdateTask', () => {
  const task: Task = {
    id: 'example-task-id',
    ownerId: 'example-user-id',
    title: 'Example task',
    description: null,
    status: 'pending',
    dueDate: null,
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
  };

  it.each(['example-user-id', 'another-user-id'])(
    'allows update:any for owner %s independently of the role name',
    (ownerId) => {
      expect(canUpdateTask(currentUser(['tasks:update:any']), { ...task, ownerId })).toBe(true);
    },
  );

  it('allows update:own for a task owned by the current user', () => {
    expect(canUpdateTask(currentUser(['tasks:update:own']), task)).toBe(true);
  });

  it('denies update:own for a task owned by another user even with read:any', () => {
    const user = currentUser(['tasks:update:own', 'tasks:read:any']);

    expect(canUpdateTask(user, { ...task, ownerId: 'another-user-id' })).toBe(false);
  });

  it.each(['tasks:read:own', 'tasks:read:any'])(
    'does not treat %s as permission to update an owned task',
    (permission) => {
      expect(canUpdateTask(currentUser([permission]), task)).toBe(false);
    },
  );

  it('does not grant update to an Admin without an update permission', () => {
    expect(canUpdateTask(currentUser([], 'Admin'), task)).toBe(false);
  });
});

describe('canDeleteTask', () => {
  const task: Task = {
    id: 'example-task-id',
    ownerId: 'example-user-id',
    title: 'Example task',
    description: null,
    status: 'pending',
    dueDate: null,
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-25T00:00:00.000Z',
  };

  it.each(['example-user-id', 'another-user-id'])(
    'allows delete:any for owner %s independently of the role name',
    (ownerId) => {
      expect(canDeleteTask(currentUser(['tasks:delete:any']), { ...task, ownerId })).toBe(true);
    },
  );

  it('allows delete:own for a task owned by the current user', () => {
    expect(canDeleteTask(currentUser(['tasks:delete:own']), task)).toBe(true);
  });

  it('denies delete:own for a task owned by another user even with read:any', () => {
    const user = currentUser(['tasks:delete:own', 'tasks:read:any']);

    expect(canDeleteTask(user, { ...task, ownerId: 'another-user-id' })).toBe(false);
  });

  it.each(['tasks:read:own', 'tasks:read:any', 'tasks:update:own', 'tasks:update:any'])(
    'does not treat %s as permission to delete an owned task',
    (permission) => {
      expect(canDeleteTask(currentUser([permission]), task)).toBe(false);
    },
  );

  it('does not grant deletion to an Admin without a delete permission', () => {
    expect(canDeleteTask(currentUser([], 'Admin'), task)).toBe(false);
  });
});
