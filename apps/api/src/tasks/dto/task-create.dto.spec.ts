import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TaskStatus } from '../../generated/prisma/client';
import { TaskCreateDto } from './task-create.dto';

describe('TaskCreateDto', () => {
  it('trims the title, defaults status, and accepts a valid past date', async () => {
    const dto = plainToInstance(TaskCreateDto, {
      title: '  Archive report  ',
      dueDate: '2020-01-02',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      title: 'Archive report',
      status: TaskStatus.pending,
      dueDate: '2020-01-02',
    });
  });

  it('rejects invalid title, description, status, due date, and owner fields', async () => {
    const dto = plainToInstance(TaskCreateDto, {
      title: ' '.repeat(121),
      description: 'x'.repeat(2001),
      status: 'blocked',
      dueDate: '2024-02-30',
      ownerId: 'not-a-uuid',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'title',
        'description',
        'status',
        'dueDate',
        'ownerId',
      ]),
    );
  });
});
