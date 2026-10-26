import { describe, expect, it } from 'vitest';
import {
  parseTaskQuery,
  serializeTaskQuery,
  TASK_QUERY_DEFAULTS,
  type TaskQueryState,
  updateTaskQuery,
} from './task-query';

describe('parseTaskQuery', () => {
  const defaults = {
    search: '',
    status: '',
    ownerId: '',
    dueDate: '',
    sort: '-createdAt',
    page: 1,
    limit: 20,
  };

  it('uses the list defaults and ignores unrelated URL parameters', () => {
    expect(parseTaskQuery('')).toEqual(defaults);
    expect(parseTaskQuery('?unexpected=value')).toEqual(defaults);
  });

  it('decodes filters, trims free text and preserves valid pagination', () => {
    expect(
      parseTaskQuery(
        '?search=++Plan+%26+review++&status=in_progress&ownerId=++11111111-1111-4111-8111-111111111111++&dueDate=2024-02-29&sort=-title&page=4&limit=50',
      ),
    ).toEqual({
      search: 'Plan & review',
      status: 'in_progress',
      ownerId: '11111111-1111-4111-8111-111111111111',
      dueDate: '2024-02-29',
      sort: '-title',
      page: 4,
      limit: 50,
    });
  });

  it.each(['pending', 'in_progress', 'completed'])('accepts the supported status %s', (status) => {
    expect(parseTaskQuery(`?status=${status}`)).toEqual({
      ...defaults,
      status,
    });
  });

  it.each([
    'createdAt',
    '-createdAt',
    'updatedAt',
    '-updatedAt',
    'dueDate',
    '-dueDate',
    'title',
    '-title',
  ])('accepts the supported sort %s', (sort) => {
    expect(parseTaskQuery(`?sort=${sort}`)).toEqual({ ...defaults, sort });
  });

  it('falls back for unsupported status and sort values', () => {
    expect(parseTaskQuery('?status=archived&sort=priority')).toEqual(defaults);
  });

  it.each(['2023-02-29', '2026-04-31', '2026-9-09', '2026-09-09T00:00:00Z'])(
    'ignores the invalid calendar date %s',
    (date) => {
      expect(parseTaskQuery(`?dueDate=${encodeURIComponent(date)}`)).toEqual(defaults);
    },
  );

  it.each([
    'page=0&limit=0',
    'page=-1&limit=-1',
    'page=1.5&limit=1.5',
    'page=invalid&limit=invalid',
    'page=9007199254740992&limit=101',
  ])('uses defaults for invalid or out-of-range pagination: %s', (query) => {
    expect(parseTaskQuery(`?${query}`)).toEqual(defaults);
  });

  it('accepts the reference pagination boundaries', () => {
    expect(parseTaskQuery('?page=9007199254740991&limit=100')).toEqual({
      ...defaults,
      page: Number.MAX_SAFE_INTEGER,
      limit: 100,
    });
  });
});

describe('serializeTaskQuery', () => {
  it('omits inactive filters and default sort, page and limit', () => {
    expect(serializeTaskQuery({ ...TASK_QUERY_DEFAULTS })).toBe('');
  });

  it('serializes all non-default criteria in a stable URL order', () => {
    const query: TaskQueryState = {
      search: 'Report',
      status: 'completed',
      ownerId: '11111111-1111-4111-8111-111111111111',
      dueDate: '2024-02-29',
      sort: '-title',
      page: 2,
      limit: 50,
    };

    expect(serializeTaskQuery(query)).toBe(
      '?search=Report&status=completed&ownerId=11111111-1111-4111-8111-111111111111&dueDate=2024-02-29&sort=-title&page=2&limit=50',
    );
    expect(parseTaskQuery(serializeTaskQuery(query))).toEqual(query);
  });

  it('encodes special characters without creating extra query parameters', () => {
    const query: TaskQueryState = {
      ...TASK_QUERY_DEFAULTS,
      search: 'Plan & review + café',
    };

    expect(serializeTaskQuery(query)).toBe('?search=Plan+%26+review+%2B+caf%C3%A9');
    expect(parseTaskQuery(serializeTaskQuery(query))).toEqual(query);
  });
});

describe('updateTaskQuery', () => {
  const criteriaCases: {
    field: string;
    changes: Partial<TaskQueryState>;
    expected: string;
  }[] = [
    {
      field: 'search',
      changes: { search: 'plan' },
      expected: '?search=plan&limit=50',
    },
    {
      field: 'status',
      changes: { status: 'pending' },
      expected: '?search=report&status=pending&limit=50',
    },
    {
      field: 'ownerId',
      changes: { ownerId: '11111111-1111-4111-8111-111111111111' },
      expected: '?search=report&ownerId=11111111-1111-4111-8111-111111111111&limit=50',
    },
    {
      field: 'dueDate',
      changes: { dueDate: '2024-02-29' },
      expected: '?search=report&dueDate=2024-02-29&limit=50',
    },
    {
      field: 'sort',
      changes: { sort: 'title' },
      expected: '?search=report&sort=title&limit=50',
    },
    {
      field: 'limit',
      changes: { limit: 100 },
      expected: '?search=report&limit=100',
    },
  ];

  it.each(criteriaCases)(
    'resets pagination when $field changes and preserves other criteria',
    ({ changes, expected }) => {
      expect(updateTaskQuery('?search=report&page=4&limit=50', changes)).toBe(expected);
    },
  );

  it('keeps the filters and page size when changing only the page', () => {
    expect(updateTaskQuery('?search=report&status=pending&page=4&limit=50', { page: 2 })).toBe(
      '?search=report&status=pending&page=2&limit=50',
    );
  });

  it('removes a cleared filter and resets pagination', () => {
    expect(updateTaskQuery('?status=pending&page=3', { status: '' })).toBe('');
  });

  it('gives a criterion reset precedence over an explicitly requested page', () => {
    expect(updateTaskQuery('?search=report&page=4', { status: 'completed', page: 8 })).toBe(
      '?search=report&status=completed',
    );
  });
});
