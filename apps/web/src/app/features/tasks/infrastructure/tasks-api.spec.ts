import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthenticatedApiClient } from '@/core/http/authenticated-api-client';
import type { CreateTaskInput, TaskListResponse, UpdateTaskInput } from '../domain/task-model';
import { TASK_QUERY_DEFAULTS, type TaskQueryState } from '../domain/task-query';
import { TasksApi } from './tasks-api';

describe('TasksApi', () => {
  let service: TasksApi;
  const client = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const response: TaskListResponse = {
    data: [
      {
        id: 'example-task-id',
        ownerId: 'example-user-id',
        title: 'Example task',
        description: null,
        status: 'pending',
        dueDate: null,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      },
    ],
    meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
  };

  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.patch.mockReset();
    client.delete.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthenticatedApiClient, useValue: client }],
    });
    service = TestBed.inject(TasksApi);
  });

  it('preserves data and metadata from the authenticated task list', async () => {
    client.get.mockResolvedValue(response);

    await expect(service.list()).resolves.toBe(response);
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith('/tasks');
  });

  it('propagates a failed list request for the presentation layer to handle', async () => {
    const failure = new Error('Request failed');
    client.get.mockRejectedValue(failure);

    await expect(service.list()).rejects.toBe(failure);
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith('/tasks');
  });

  it('serializes query criteria while preserving the complete response', async () => {
    const query: TaskQueryState = {
      search: 'Plan & review',
      status: 'completed',
      ownerId: '11111111-1111-4111-8111-111111111111',
      dueDate: '2024-02-29',
      sort: '-title',
      page: 2,
      limit: 50,
    };
    client.get.mockResolvedValue(response);

    await expect(service.list(query)).resolves.toBe(response);
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith(
      '/tasks?search=Plan+%26+review&status=completed&ownerId=11111111-1111-4111-8111-111111111111&dueDate=2024-02-29&sort=-title&page=2&limit=50',
    );
  });

  it('keeps the original endpoint when given explicit query defaults', async () => {
    client.get.mockResolvedValue(response);

    await expect(service.list({ ...TASK_QUERY_DEFAULTS })).resolves.toBe(response);
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith('/tasks');
  });

  describe('create', () => {
    it('posts the supported fields and returns the created task without an envelope', async () => {
      const input: CreateTaskInput = {
        title: 'Prepare report',
        description: 'Review the quarterly results',
        status: 'in_progress',
        dueDate: '2026-10-26',
      };
      const created = { ...response.data[0], ...input, id: 'created-task-id' };
      client.post.mockResolvedValue(created);

      await expect(service.create(input)).resolves.toBe(created);
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.post).toHaveBeenCalledWith('/tasks', input);
      expect(client.get).not.toHaveBeenCalled();
    });

    it('preserves omitted optional fields without inventing an owner or null values', async () => {
      const input: CreateTaskInput = { title: 'Prepare report', status: 'pending' };
      const created = { ...response.data[0], title: input.title };
      client.post.mockResolvedValue(created);

      await expect(service.create(input)).resolves.toBe(created);
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.post).toHaveBeenCalledWith('/tasks', {
        title: 'Prepare report',
        status: 'pending',
      });
      expect(client.get).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the selected task without a body or automatic list refresh', async () => {
      client.delete.mockResolvedValue(null);

      await expect(service.remove('delete-target-id')).resolves.toBeNull();
      expect(client.delete).toHaveBeenCalledTimes(1);
      expect(client.delete).toHaveBeenCalledWith('/tasks/delete-target-id');
      expect(client.get).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
      expect(client.patch).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('patches the selected task with supported fields and returns the updated resource', async () => {
      const input: UpdateTaskInput = {
        title: 'Updated report',
        description: 'Review the revised quarterly results',
        status: 'completed',
        dueDate: '2026-10-28',
      };
      const updated = { ...response.data[0], ...input };
      client.patch.mockResolvedValue(updated);

      await expect(service.update('example-task-id', input)).resolves.toBe(updated);
      expect(client.patch).toHaveBeenCalledTimes(1);
      expect(client.patch).toHaveBeenCalledWith('/tasks/example-task-id', input);
      expect(client.get).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('preserves explicit nulls when clearing description and due date', async () => {
      const input: UpdateTaskInput = { description: null, dueDate: null };
      const updated = { ...response.data[0], description: null, dueDate: null };
      client.patch.mockResolvedValue(updated);

      await expect(service.update('example-task-id', input)).resolves.toBe(updated);
      expect(client.patch).toHaveBeenCalledTimes(1);
      expect(client.patch).toHaveBeenCalledWith('/tasks/example-task-id', {
        description: null,
        dueDate: null,
      });
      expect(client.get).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('preserves omitted fields in a partial update without adding defaults or ownership', async () => {
      const input: UpdateTaskInput = { status: 'in_progress' };
      const updated = { ...response.data[0], status: 'in_progress' };
      client.patch.mockResolvedValue(updated);

      await expect(service.update('example-task-id', input)).resolves.toBe(updated);
      expect(client.patch).toHaveBeenCalledTimes(1);
      expect(client.patch).toHaveBeenCalledWith('/tasks/example-task-id', {
        status: 'in_progress',
      });
      expect(client.get).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('propagates an update failure unchanged without issuing other requests', async () => {
      const input: UpdateTaskInput = { title: 'Updated report' };
      const failure = new Error('Unable to update task');
      client.patch.mockRejectedValue(failure);

      await expect(service.update('example-task-id', input)).rejects.toBe(failure);
      expect(client.patch).toHaveBeenCalledTimes(1);
      expect(client.patch).toHaveBeenCalledWith('/tasks/example-task-id', input);
      expect(client.get).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
      expect(client.delete).not.toHaveBeenCalled();
    });
  });
});
