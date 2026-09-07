import { ForbiddenException } from '@nestjs/common';
import type { CurrentUser } from '../auth/auth.types';
import { getTaskUpdateScope } from './task-policy';

describe('task update policy', () => {
  const member: CurrentUser = {
    id: 'member-id',
    email: 'member@example.com',
    name: 'Member User',
    role: 'Member',
    permissions: ['tasks:update:own'],
  };

  const admin: CurrentUser = {
    ...member,
    id: 'admin-id',
    permissions: ['tasks:update:any'],
  };

  it('scopes own updates to the authenticated owner', () => {
    expect(getTaskUpdateScope(member, 'task-id')).toEqual({
      id: 'task-id',
      ownerId: 'member-id',
    });
  });

  it('allows any-scoped updates without an owner predicate', () => {
    expect(getTaskUpdateScope(admin, 'task-id')).toEqual({ id: 'task-id' });
  });

  it('rejects users without an update grant', () => {
    expect(() =>
      getTaskUpdateScope({ ...member, permissions: [] }, 'task-id'),
    ).toThrow(new ForbiddenException('Insufficient permissions'));
  });
});
