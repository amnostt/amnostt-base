import { ForbiddenException } from '@nestjs/common';
import type { CurrentUser } from '../auth/auth.types';
import {
  getTaskListScope,
  getTaskReadScope,
  assertTaskOwnerFilter,
} from './task-policy';

describe('task read policy', () => {
  const member: CurrentUser = {
    id: 'member-id',
    email: 'member@example.com',
    name: 'Member User',
    role: 'Member',
    permissions: ['tasks:read:own'],
  };

  const admin: CurrentUser = {
    ...member,
    id: 'admin-id',
    permissions: ['tasks:read:own', 'tasks:read:any'],
  };

  const anyOnly: CurrentUser = {
    ...member,
    permissions: ['tasks:read:any'],
  };

  it('scopes own list access to the authenticated owner', () => {
    expect(getTaskListScope(member)).toEqual({ ownerId: 'member-id' });
    expect(getTaskReadScope(member, 'task-id')).toEqual({
      id: 'task-id',
      ownerId: 'member-id',
    });
  });

  it('leaves any-scoped list and read access unbounded by owner', () => {
    expect(getTaskListScope(admin)).toEqual({});
    expect(getTaskReadScope(admin, 'task-id')).toEqual({ id: 'task-id' });
  });

  it('rejects an explicit foreign owner filter without any scope', () => {
    expect(() => assertTaskOwnerFilter(member, 'other-id')).toThrow(
      new ForbiddenException('Insufficient permissions'),
    );
    expect(() => assertTaskOwnerFilter(member, 'member-id')).not.toThrow();
    expect(() => assertTaskOwnerFilter(admin, 'other-id')).not.toThrow();
  });

  it('requires the own read grant before any scope can broaden access', () => {
    expect(() => getTaskListScope(anyOnly)).toThrow(
      new ForbiddenException('Insufficient permissions'),
    );
  });
});
