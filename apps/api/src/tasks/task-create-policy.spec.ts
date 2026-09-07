import { ForbiddenException } from '@nestjs/common';
import type { CurrentUser } from '../auth/auth.types';
import { getTaskCreateOwnerId } from './task-policy';

describe('task create policy', () => {
  const member: CurrentUser = {
    id: 'member-id',
    email: 'member@example.com',
    name: 'Member User',
    role: 'Member',
    permissions: ['tasks:create:own'],
  };

  const admin: CurrentUser = {
    ...member,
    id: 'admin-id',
    permissions: ['tasks:create:any'],
  };

  it('assigns an omitted owner to the authenticated user', () => {
    expect(getTaskCreateOwnerId(member)).toBe('member-id');
    expect(getTaskCreateOwnerId(member, 'member-id')).toBe('member-id');
  });

  it('allows an any-scoped user to create for an explicit foreign owner', () => {
    expect(getTaskCreateOwnerId(admin, 'member-id')).toBe('member-id');
  });

  it('rejects an explicit foreign owner without the any grant', () => {
    expect(() => getTaskCreateOwnerId(member, 'other-id')).toThrow(
      new ForbiddenException('Insufficient permissions'),
    );
  });
});
