import { NotFoundException } from '@nestjs/common';
import { TaskStatus } from '../generated/prisma/client';
import type { CurrentUser } from '../auth/auth.types';
import { TasksService } from './tasks.service';

const user: CurrentUser = {
  id: 'member-id',
  email: 'member@example.com',
  name: 'Member User',
  role: 'Member',
  permissions: ['tasks:read:own', 'tasks:update:own', 'tasks:delete:own'],
};

const task = {
  id: 'task-id',
  ownerId: user.id,
  title: 'Task',
  description: null,
  status: TaskStatus.pending,
  dueDate: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function createService(taskDelegate: Record<string, jest.Mock>) {
  const prisma = {
    task: taskDelegate,
    $transaction: jest.fn(
      (
        callback: (transaction: { task: Record<string, jest.Mock> }) => unknown,
      ) => Promise.resolve(callback({ task: taskDelegate })),
    ),
  };
  return { service: new TasksService(prisma as never), prisma };
}

describe('TasksService', () => {
  it('allows an any-only user to list all tasks', async () => {
    const findMany = jest.fn().mockResolvedValue([task]);
    const count = jest.fn().mockResolvedValue(1);
    const { service } = createService({ findMany, count });

    await expect(
      service.findAll(
        { ...user, permissions: ['tasks:read:any'] },
        { sort: '-createdAt', page: 1, limit: 20 },
      ),
    ).resolves.toMatchObject({
      data: [{ id: task.id }],
      meta: { totalItems: 1 },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it('keeps own-only list queries isolated to the authenticated owner', async () => {
    const findMany = jest.fn().mockResolvedValue([task]);
    const count = jest.fn().mockResolvedValue(1);
    const { service } = createService({ findMany, count });

    await service.findAll(user, { sort: 'title', page: 1, limit: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: user.id } }),
    );
  });

  it('uses one repeatable-read transaction for a matching list and count snapshot', async () => {
    const findMany = jest.fn().mockResolvedValue([task]);
    const count = jest.fn().mockResolvedValue(1);
    const { service, prisma } = createService({ findMany, count });

    await service.findAll(user, { sort: '-createdAt', page: 1, limit: 20 });

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'RepeatableRead' }),
    );
  });

  it('returns a stable owner error for a missing foreign-key owner', async () => {
    const create = jest.fn().mockRejectedValue({ code: 'P2003' });
    const { service } = createService({ create });

    await expect(
      service.create(
        { ...user, permissions: ['tasks:create:any'] },
        { ownerId: '00000000-0000-4000-8000-000000000001', title: 'Task' },
      ),
    ).rejects.toEqual(new NotFoundException('Task owner not found'));
  });

  it('returns not found when an authorized record disappears before an atomic update', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const { service } = createService({ updateMany });

    await expect(
      service.update(user, task.id, { title: 'Updated' }),
    ).rejects.toEqual(new NotFoundException('Task not found'));
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: task.id, ownerId: user.id } }),
    );
  });

  it('returns not found when an authorized record disappears before an atomic delete', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const { service } = createService({ deleteMany });

    await expect(service.remove(user, task.id)).rejects.toEqual(
      new NotFoundException('Task not found'),
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: task.id, ownerId: user.id },
    });
  });
});
