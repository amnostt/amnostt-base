import { ForbiddenException } from '@nestjs/common';
import type { CurrentUser } from '../auth/auth.types';
import { getTaskDeleteScope } from './task-policy';

describe('task delete policy', () => {
  const member: CurrentUser = {
    id: 'member-id',
    email: 'member@example.com',
    name: 'Member User',
    role: 'Member',
    permissions: ['tasks:delete:own'],
  };

  const admin: CurrentUser = {
    ...member,
    id: 'admin-id',
    permissions: ['tasks:delete:any'],
  };

  it('scopes own deletes to the authenticated owner', () => {
    expect(getTaskDeleteScope(member, 'task-id')).toEqual({
      id: 'task-id',
      ownerId: 'member-id',
    });
  });

  it('allows any-scoped deletes without an owner predicate', () => {
    expect(getTaskDeleteScope(admin, 'task-id')).toEqual({ id: 'task-id' });
  });

  it('rejects users without a delete grant', () => {
    expect(() =>
      getTaskDeleteScope({ ...member, permissions: [] }, 'task-id'),
    ).toThrow(new ForbiddenException('Insufficient permissions'));
  });
});
