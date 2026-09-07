import { BadRequestException } from '@nestjs/common';
import {
  escapeTaskSearch,
  parseTaskCalendarDate,
  serializeTaskCalendarDate,
} from './task-query';

describe('task query semantics', () => {
  it('uses list defaults and escapes every SQL LIKE metacharacter literally', () => {
    expect(escapeTaskSearch('100%_done\\now')).toBe('100\\%\\_done\\\\now');
  });

  it('round-trips valid calendar dates without timezone conversion', () => {
    const date = parseTaskCalendarDate('2024-02-29');
    expect(serializeTaskCalendarDate(date)).toBe('2024-02-29');
  });

  it.each(['2024-02-30', '2024-13-01', '24-01-01'])(
    'rejects an invalid calendar date: %s',
    (value) => {
      expect(() => parseTaskCalendarDate(value)).toThrow(BadRequestException);
    },
  );
});
