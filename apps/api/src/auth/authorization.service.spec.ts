import { ForbiddenException } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { CurrentUser } from './auth.types';

describe('AuthorizationService', () => {
  const service = new AuthorizationService();

  const member: CurrentUser = {
    id: 'member-id',
    email: 'member@example.com',
    name: 'Member User',
    role: 'Member',
    permissions: ['tasks:read:own'],
  };

  it('allows an own permission for a resource owned by the current user', () => {
    expect(
      service.hasPermission(member, 'tasks:read:own', {
        ownerId: 'member-id',
      }),
    ).toBe(true);
  });

  it('rejects an own permission for a resource owned by another user', () => {
    expect(
      service.hasPermission(member, 'tasks:read:own', {
        ownerId: 'other-id',
      }),
    ).toBe(false);
  });

  it('allows an any permission for both owned and foreign resources', () => {
    const admin: CurrentUser = {
      ...member,
      permissions: ['tasks:read:any'],
    };

    expect(service.hasPermission(admin, 'tasks:read:any')).toBe(true);
    expect(
      service.hasPermission(admin, 'tasks:read:own', { ownerId: 'other-id' }),
    ).toBe(true);
  });

  it('rejects a missing permission and raises 403 when asserted', () => {
    expect(
      service.hasPermission(member, 'tasks:update:own', {
        ownerId: 'member-id',
      }),
    ).toBe(false);

    expect(() =>
      service.assertPermission(member, 'tasks:update:own', {
        ownerId: 'member-id',
      }),
    ).toThrow(new ForbiddenException('Insufficient permissions'));
  });

  it('does not let an own permission authorize an any request', () => {
    expect(
      service.hasPermission(member, 'tasks:read:any', {
        ownerId: 'member-id',
      }),
    ).toBe(false);
  });

  it('rejects malformed permission requirements', () => {
    expect(service.hasPermission(member, 'tasks:read')).toBe(false);
    expect(service.hasPermission(member, 'tasks:read:own:extra')).toBe(false);
    expect(
      service.hasPermission(member, 'tasks:read:invalid', {
        ownerId: 'member-id',
      }),
    ).toBe(false);
  });

  it('uses the current permissions on every evaluation', () => {
    expect(
      service.hasPermission(member, 'tasks:update:own', {
        ownerId: 'member-id',
      }),
    ).toBe(false);

    member.permissions = ['tasks:update:own'];

    expect(
      service.hasPermission(member, 'tasks:update:own', {
        ownerId: 'member-id',
      }),
    ).toBe(true);
  });
});
