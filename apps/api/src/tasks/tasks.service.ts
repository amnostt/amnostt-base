import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import type { CurrentUser } from '../auth/auth.types';
import {
  assertTaskOwnerFilter,
  getTaskListScope,
  getTaskReadScope,
} from './task-policy';
import {
  escapeTaskSearch,
  parseTaskCalendarDate,
  serializeTaskCalendarDate,
} from './task-query';
import type { TaskQueryDto } from './dto/task-query.dto';

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
    const [tasks, totalItems] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: { [field]: descending ? 'desc' : 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.task.count({ where }),
    ]);

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

  async findOne(currentUser: CurrentUser, id: string): Promise<TaskResponse> {
    const task = await this.prisma.task.findFirst({
      where: getTaskReadScope(currentUser, id),
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.toResponse(task);
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
}
