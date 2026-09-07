import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TaskStatus } from '../../generated/prisma/client';
import { TaskUpdateDto } from './task-update.dto';

describe('TaskUpdateDto', () => {
  it('trims partial fields and accepts null values that clear editable data', async () => {
    const dto = plainToInstance(TaskUpdateDto, {
      title: '  Updated report  ',
      description: null,
      status: TaskStatus.completed,
      dueDate: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      title: 'Updated report',
      description: null,
      status: TaskStatus.completed,
      dueDate: null,
    });
  });

  it('rejects invalid editable fields', async () => {
    const dto = plainToInstance(TaskUpdateDto, {
      title: ' ',
      description: 'x'.repeat(2001),
      status: 'blocked',
      dueDate: '2024-02-30',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['title', 'description', 'status', 'dueDate']),
    );
  });

  it('rejects ownerId instead of accepting an ownership transfer', async () => {
    const dto = plainToInstance(TaskUpdateDto, {
      title: 'Updated report',
      ownerId: 'member-id',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toContain('ownerId');
  });

  it('accepts a status-only patch without inventing omitted fields', async () => {
    const dto = plainToInstance(TaskUpdateDto, {
      status: TaskStatus.in_progress,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({ status: TaskStatus.in_progress });
    expect(dto.title).toBeUndefined();
    expect(dto.dueDate).toBeUndefined();
  });
});
