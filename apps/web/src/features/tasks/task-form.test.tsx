import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../core/http/api-client';
import { TaskForm } from './task-form';
import type { Task } from './task-models';

type Requester = <T>(path: string, init?: RequestInit) => Promise<T>;

const existingTask: Task = {
  id: 'task-1',
  ownerId: 'member-id',
  title: 'Existing task',
  description: null,
  status: 'pending',
  dueDate: '2024-02-29',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function renderForm(
  request: Requester = vi.fn().mockResolvedValue({ id: 'task-1' }),
  task?: Task,
) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <TaskForm
      request={request}
      onClose={onClose}
      onSaved={onSaved}
      task={task}
    />,
  );
  return { onClose, onSaved };
}

afterEach(cleanup);

describe('TaskForm', () => {
  it('shows field validation and does not submit an empty title', async () => {
    const request = vi.fn();
    renderForm(request);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Create task' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Title is required.');
    expect(request).not.toHaveBeenCalled();
  });

  it('submits a trimmed title with the pending status and a past date', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'task-1' });
    const { onSaved } = renderForm(request);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Title'), '  Past task  ');
    await user.type(screen.getByLabelText('Due date'), '2020-01-02');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledWith('/tasks', {
      body: JSON.stringify({
        title: 'Past task',
        status: 'pending',
        dueDate: '2020-01-02',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  });

  it('requires confirmation before closing a dirty form', async () => {
    const { onClose } = renderForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Title'), 'Draft task');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Discard unsaved changes?',
    );
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses the shared form to clear a due date while editing', async () => {
    const request = vi.fn().mockResolvedValue(existingTask);
    const { onSaved } = renderForm(request, existingTask);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Updated task');
    await user.clear(screen.getByLabelText('Due date'));
    await user.click(screen.getByRole('button', { name: 'Update task' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledWith('/tasks/task-1', {
      body: JSON.stringify({
        title: 'Updated task',
        description: null,
        status: 'pending',
        dueDate: null,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
  });

  it('keeps edit values and shows both field and general errors', async () => {
    const request = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          400,
          'VALIDATION_FAILED',
          [{ field: 'title', code: 'TOO_LONG' }],
          'Unable to update task.',
        ),
      );
    renderForm(request, existingTask);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Updated task');
    await user.click(screen.getByRole('button', { name: 'Update task' }));

    await waitFor(() =>
      expect(screen.getByText('Invalid title.')).toBeInTheDocument(),
    );
    expect(screen.getByText('Unable to update task.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Updated task');
  });

  it('requires the same dirty-close confirmation in edit mode', async () => {
    const { onClose } = renderForm(undefined, existingTask);
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText('Description'),
      'Changed description',
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Discard unsaved changes?',
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
