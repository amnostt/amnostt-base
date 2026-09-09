import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import type { CurrentUser } from '../auth/auth.types';
import {
  assertTaskOwnerFilter,
  getTaskCreateOwnerId,
  getTaskDeleteScope,
  getTaskListScope,
  getTaskReadScope,
  getTaskUpdateScope,
} from './task-policy';
import {
  escapeTaskSearch,
  parseTaskCalendarDate,
  serializeTaskCalendarDate,
} from './task-query';
import type { TaskQueryDto } from './dto/task-query.dto';
import type { TaskCreateDto } from './dto/task-create.dto';
import type { TaskUpdateDto } from './dto/task-update.dto';

export interface TaskResponse {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskListResponse {
  data: TaskResponse[];
  meta: { page: number; limit: number; totalItems: number; totalPages: number };
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    currentUser: CurrentUser,
    taskDto: TaskCreateDto,
  ): Promise<TaskResponse> {
    try {
      const task = await this.prisma.task.create({
        data: {
          ownerId: getTaskCreateOwnerId(currentUser, taskDto.ownerId),
          title: taskDto.title,
          description: taskDto.description ?? null,
          status: taskDto.status ?? TaskStatus.pending,
          dueDate: taskDto.dueDate
            ? parseTaskCalendarDate(taskDto.dueDate)
            : null,
        },
      });

      return this.toResponse(task);
    } catch (error) {
      if (this.hasPrismaCode(error, 'P2003')) {
        throw new NotFoundException('Task owner not found');
      }
      throw error;
    }
  }

  async findAll(
    currentUser: CurrentUser,
    query: TaskQueryDto,
  ): Promise<TaskListResponse> {
    const scope = getTaskListScope(currentUser);
    if (query.ownerId) assertTaskOwnerFilter(currentUser, query.ownerId);

    const where: Prisma.TaskWhereInput = {
      ...scope,
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dueDate
        ? { dueDate: parseTaskCalendarDate(query.dueDate) }
        : {}),
    };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: escapeTaskSearch(search), mode: 'insensitive' } },
        {
          description: {
            contains: escapeTaskSearch(search),
            mode: 'insensitive',
          },
        },
      ];
    }

    const descending = query.sort.startsWith('-');
    const field = (
      descending ? query.sort.slice(1) : query.sort
    ) as keyof Prisma.TaskOrderByWithRelationInput;
    const [tasks, totalItems] = await this.prisma.$transaction(
      (transaction) =>
        Promise.all([
          transaction.task.findMany({
            where,
            orderBy: [{ [field]: descending ? 'desc' : 'asc' }, { id: 'asc' }],
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          transaction.task.count({ where }),
        ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      data: tasks.map((task) => this.toResponse(task)),
      meta: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages: totalItems ? Math.ceil(totalItems / query.limit) : 0,
      },
    };
  }

  async update(
    currentUser: CurrentUser,
    id: string,
    taskDto: TaskUpdateDto,
  ): Promise<TaskResponse> {
    const updatedTask = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.task.updateMany({
        where: getTaskUpdateScope(currentUser, id),
        data: this.getUpdateData(taskDto),
      });
      if (result.count !== 1) throw new NotFoundException('Task not found');

      const task = await transaction.task.findUnique({ where: { id } });
      if (!task) throw new NotFoundException('Task not found');
      return task;
    });

    return this.toResponse(updatedTask);
  }

  async findOne(currentUser: CurrentUser, id: string): Promise<TaskResponse> {
    const task = await this.prisma.task.findFirst({
      where: getTaskReadScope(currentUser, id),
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.toResponse(task);
  }

  async remove(currentUser: CurrentUser, id: string): Promise<void> {
    const result = await this.prisma.task.deleteMany({
      where: getTaskDeleteScope(currentUser, id),
    });
    if (result.count !== 1) throw new NotFoundException('Task not found');
  }

  private toResponse(task: {
    id: string;
    ownerId: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    dueDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): TaskResponse {
    return {
      ...task,
      dueDate: task.dueDate ? serializeTaskCalendarDate(task.dueDate) : null,
    };
  }

  private getUpdateData(
    taskDto: TaskUpdateDto,
  ): Prisma.TaskUpdateManyMutationInput {
    return {
      ...(taskDto.title !== undefined ? { title: taskDto.title } : {}),
      ...(taskDto.description !== undefined
        ? { description: taskDto.description }
        : {}),
      ...(taskDto.status !== undefined ? { status: taskDto.status } : {}),
      ...(taskDto.dueDate !== undefined
        ? {
            dueDate: taskDto.dueDate
              ? parseTaskCalendarDate(taskDto.dueDate)
              : null,
          }
        : {}),
    };
  }

  private hasPrismaCode(error: unknown, code: string): boolean {
    return (
      (error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined) === code
    );
  }
}
