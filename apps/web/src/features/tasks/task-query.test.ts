import { describe, expect, it } from 'vitest';
import { isValidCalendarDate } from './calendar-date';
import {
  parseTaskQuery,
  serializeTaskQuery,
  updateTaskQuery,
} from './task-query';

describe('task query state', () => {
  it('uses stable defaults and preserves only allowlisted values', () => {
    expect(parseTaskQuery('?unexpected=value&page=0&sort=priority')).toEqual({
      search: '',
      status: '',
      ownerId: '',
      dueDate: '',
      sort: '-createdAt',
      page: 1,
      limit: 20,
    });
  });

  it('round-trips rich query state in deterministic URL order', () => {
    const state = parseTaskQuery(
      '?search=Report&status=completed&ownerId=member-id&dueDate=2024-02-29&sort=-title&page=2&limit=50',
    );

    expect(serializeTaskQuery(state)).toBe(
      '?search=Report&status=completed&ownerId=member-id&dueDate=2024-02-29&sort=-title&page=2&limit=50',
    );
  });

  it('updates one criterion while resetting pagination and omitting defaults', () => {
    expect(
      updateTaskQuery('?search=report&page=4&limit=50', {
        status: 'pending',
      }),
    ).toBe('?search=report&status=pending&limit=50');

    expect(updateTaskQuery('?status=pending&page=3', { status: '' })).toBe('');
  });
});

describe('calendar-date validation', () => {
  it('accepts real ISO calendar dates', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true);
    expect(isValidCalendarDate('2026-09-09')).toBe(true);
  });

  it('rejects malformed and impossible calendar dates', () => {
    expect(isValidCalendarDate('2023-02-29')).toBe(false);
    expect(isValidCalendarDate('2026-04-31')).toBe(false);
    expect(isValidCalendarDate('2026-9-09')).toBe(false);
    expect(isValidCalendarDate('2026-09-09T00:00:00Z')).toBe(false);
  });
});
