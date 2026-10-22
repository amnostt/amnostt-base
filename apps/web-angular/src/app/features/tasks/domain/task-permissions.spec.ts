import { describe, expect, it } from 'vitest';
import type { CurrentUser } from '@/features/auth/domain/auth-models';
import { canCreateTasks } from './task-permissions';

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
