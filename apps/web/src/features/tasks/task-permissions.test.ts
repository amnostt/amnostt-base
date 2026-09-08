import { describe, expect, it } from 'vitest';
import { canShowTaskRowAction } from './task-permissions';

describe('task row permissions', () => {
  it('shows each own action only on rows owned by the current user', () => {
    const user = {
      id: 'member-id',
      permissions: ['tasks:update:own', 'tasks:delete:own'],
    };

    expect(canShowTaskRowAction(user, 'update', 'member-id')).toBe(true);
    expect(canShowTaskRowAction(user, 'delete', 'member-id')).toBe(true);
    expect(canShowTaskRowAction(user, 'update', 'other-id')).toBe(false);
    expect(canShowTaskRowAction(user, 'delete', 'other-id')).toBe(false);
  });

  it('evaluates update and delete independently for any-scoped permissions', () => {
    const user = { id: 'member-id', permissions: ['tasks:update:any'] };

    expect(canShowTaskRowAction(user, 'update', 'other-id')).toBe(true);
    expect(canShowTaskRowAction(user, 'delete', 'other-id')).toBe(false);
  });
});
