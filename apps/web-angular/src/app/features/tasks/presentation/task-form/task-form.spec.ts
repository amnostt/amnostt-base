import { Component, signal, viewChild } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import type { Task, TaskStatus } from '../../domain/task-model';
import { TasksApi } from '../../infrastructure/tasks-api';
import { TaskForm } from './task-form';

@Component({
  imports: [TaskForm],
  template: '<app-task-form [task]="task()" (saved)="onSaved($event)" />',
})
class TestHost {
  readonly task = signal<Task | null>(null);
  readonly form = viewChild.required(TaskForm);
  readonly onSaved = vi.fn();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('TaskForm creation', () => {
  let fixture: ComponentFixture<TestHost>;
  let page: HTMLElement;
  const api = { create: vi.fn(), update: vi.fn() };
  const created: Task = {
    id: 'created-task-id',
    ownerId: 'example-user-id',
    title: 'Prepare report',
    description: null,
    status: 'pending',
    dueDate: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
  };

  beforeEach(async () => {
    api.create.mockReset();
    api.create.mockResolvedValue(created);
    api.update.mockReset();
    await TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideZard(), { provide: TasksApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(TestHost);
    await fixture.whenStable();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function titleInput(): HTMLInputElement {
    const input = page.querySelector<HTMLInputElement>('#task-title');
    expect(input).not.toBeNull();
    return input!;
  }

  function descriptionInput(): HTMLTextAreaElement {
    const input = page.querySelector<HTMLTextAreaElement>('textarea#task-description');
    expect(input).not.toBeNull();
    return input!;
  }

  function statusTrigger(): HTMLButtonElement {
    const trigger = page.querySelector<HTMLButtonElement>('z-select button[role="combobox"]');
    expect(trigger).not.toBeNull();
    return trigger!;
  }

  async function chooseStatus(value: TaskStatus) {
    statusTrigger().click();
    await settle();
    const option = document.body.querySelector<HTMLElement>(`[role="option"][value="${value}"]`);
    expect(option).not.toBeNull();
    option!.click();
    await settle();
  }

  function dueDateTrigger(): HTMLButtonElement {
    const picker = page.querySelector('[data-slot="date-picker"]');
    expect(picker).not.toBeNull();
    const trigger = picker!.querySelector<HTMLButtonElement>('button');
    expect(trigger).not.toBeNull();
    expect(trigger!.id).not.toBe('');
    const label = Array.from(page.querySelectorAll('label')).find(
      (item) => item.htmlFor === trigger!.id,
    );
    expect(label?.textContent?.trim()).toBe('Fecha de vencimiento');
    return trigger!;
  }

  function clearDueDateButton(): HTMLButtonElement {
    const button = Array.from(page.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Limpiar vencimiento',
    );
    expect(button).toBeDefined();
    return button!;
  }

  function dateLabel(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(
      new Date(year, month - 1, day, 12),
    );
  }

  async function chooseDueDate(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    vi.setSystemTime(date);
    dueDateTrigger().click();
    await settle();
    const expectedDay = date.toLocaleDateString('es');
    const monthName = new Intl.DateTimeFormat('es', { month: 'long' }).format(date);
    let button: HTMLButtonElement | undefined;
    await vi.waitFor(() => {
      button = Array.from(
        document.body.querySelectorAll<HTMLButtonElement>('button[data-day]'),
      ).find(
        (item) =>
          item.getAttribute('data-day') === expectedDay &&
          item.getAttribute('aria-label')?.toLowerCase().includes(monthName) &&
          item.getAttribute('aria-label')?.includes(String(year)),
      );
      expect(button).toBeDefined();
    });
    button!.click();
    await settle();
    await vi.waitFor(() => expect(document.body.querySelector('z-calendar')).toBeNull());
  }

  function submitButton(): HTMLButtonElement {
    const button = page.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(button).not.toBeNull();
    return button!;
  }

  async function enterTitle(value: string) {
    const input = titleInput();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  async function enterDescription(value: string) {
    const input = descriptionInput();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  function startSubmit() {
    const form = page.querySelector('form');
    expect(form).not.toBeNull();
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  async function settle() {
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  }

  describe('existing task', () => {
    async function loadTask(dueDate: string | null = '2026-10-26'): Promise<Task> {
      const task: Task = {
        ...created,
        id: 'existing-task-id',
        title: 'Existing report',
        description: 'Original description',
        status: 'in_progress',
        dueDate,
      };
      fixture.componentInstance.task.set(task);
      await settle();
      return task;
    }

    function closeState() {
      return fixture.componentInstance.form().getCloseState();
    }

    describe('submission', () => {
      it.each(['2026-10-26', '2024-02-29'])(
        'updates the selected task with supported fields and calendar date %s, never creating',
        async (dueDate) => {
          const task = await loadTask(dueDate);
          const description = '  Revised\nnotes  ';
          const updated: Task = {
            ...task,
            title: 'Updated report',
            description,
            status: 'completed',
          };
          api.update.mockResolvedValue(updated);
          await enterTitle('  Updated report  ');
          await enterDescription(description);
          await chooseStatus('completed');

          expect(submitButton().textContent?.trim()).toBe('Guardar cambios');
          startSubmit();
          await settle();

          expect(api.update).toHaveBeenCalledExactlyOnceWith(task.id, {
            title: 'Updated report',
            description,
            status: 'completed',
            dueDate,
          });
          expect(api.create).not.toHaveBeenCalled();
          expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(updated);
        },
      );

      it('sends explicit nulls to clear the existing description and due date', async () => {
        const task = await loadTask();
        const updated = { ...task, description: null, dueDate: null };
        api.update.mockResolvedValue(updated);
        await enterDescription('');
        clearDueDateButton().click();
        await settle();
        startSubmit();
        await settle();

        expect(api.update).toHaveBeenCalledExactlyOnceWith(task.id, {
          title: task.title,
          description: null,
          status: task.status,
          dueDate: null,
        });
        expect(api.create).not.toHaveBeenCalled();
        expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(updated);
      });

      it('retains the edit draft after failure and retries PATCH without creating', async () => {
        const task = await loadTask();
        const updated = { ...task, title: 'Revised draft' };
        api.update
          .mockRejectedValueOnce(new Error('Network unavailable'))
          .mockResolvedValueOnce(updated);
        await enterTitle('Revised draft');
        startSubmit();
        await settle();

        expect(page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
          'No pudimos actualizar la tarea. Inténtalo de nuevo.',
        );
        expect(titleInput().value).toBe('Revised draft');
        expect(descriptionInput().value).toBe(task.description);
        expect(statusTrigger().textContent?.trim()).toBe('En progreso');
        expect(dueDateTrigger().textContent).toContain(dateLabel(task.dueDate!));
        expect(closeState()).toEqual({ dirty: true, saving: false });
        expect(submitButton().disabled).toBe(false);
        expect(api.create).not.toHaveBeenCalled();
        expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();

        startSubmit();
        await settle();

        expect(api.update).toHaveBeenCalledTimes(2);
        for (const call of [1, 2]) {
          expect(api.update).toHaveBeenNthCalledWith(call, task.id, {
            title: 'Revised draft',
            description: task.description,
            status: task.status,
            dueDate: task.dueDate,
          });
        }
        expect(page.querySelector('[role="alert"]')).toBeNull();
        expect(api.create).not.toHaveBeenCalled();
        expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(updated);
      });

      it('locks the edit controls and ignores duplicate submits until PATCH finishes', async () => {
        const task = await loadTask();
        const pending = deferred<Task>();
        api.update.mockReturnValue(pending.promise);
        startSubmit();
        await settle();

        try {
          expect(submitButton().textContent?.trim()).toBe('Guardando…');
          expect(submitButton().disabled).toBe(true);
          expect(page.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
          expect(titleInput().readOnly).toBe(true);
          expect(descriptionInput().readOnly).toBe(true);
          expect(statusTrigger().disabled).toBe(true);
          expect(dueDateTrigger().disabled).toBe(true);
          expect(clearDueDateButton().disabled).toBe(true);
          expect(closeState()).toEqual({ dirty: false, saving: true });
          startSubmit();
          await settle();

          expect(api.update).toHaveBeenCalledExactlyOnceWith(task.id, {
            title: task.title,
            description: task.description,
            status: task.status,
            dueDate: task.dueDate,
          });
          expect(api.create).not.toHaveBeenCalled();
          expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
        } finally {
          pending.resolve(task);
          await settle();
        }

        expect(closeState().saving).toBe(false);
        expect(submitButton().disabled).toBe(false);
        expect(submitButton().textContent?.trim()).toBe('Guardar cambios');
        expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
      });

      it.each(['', '   '])('rejects an invalid edit title %j without a mutation', async (title) => {
        await loadTask();
        await enterTitle(title);
        startSubmit();
        await settle();

        expect(page.querySelector('#task-title-error')?.textContent?.trim()).toBe(
          'Ingresa un título.',
        );
        expect(api.update).not.toHaveBeenCalled();
        expect(api.create).not.toHaveBeenCalled();
        expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
      });

      it('retains invalid edit values and rejects excessive field lengths without a mutation', async () => {
        await loadTask();
        await enterTitle('t'.repeat(121));
        await enterDescription('d'.repeat(2001));
        startSubmit();
        await settle();

        expect(page.querySelector('#task-title-error')?.textContent?.trim()).toBe(
          'El título debe tener como máximo 120 caracteres.',
        );
        expect(page.querySelector('#task-description-error')?.textContent?.trim()).toBe(
          'La descripción debe tener como máximo 2000 caracteres.',
        );
        expect(titleInput().value).toBe('t'.repeat(121));
        expect(descriptionInput().value).toBe('d'.repeat(2001));
        expect(api.update).not.toHaveBeenCalled();
        expect(api.create).not.toHaveBeenCalled();
        expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
      });
    });

    it.each(['2026-10-26', '2024-02-29', null])(
      'prefills supported fields and calendar date %s without saving or marking changes',
      async (dueDate) => {
        const task = await loadTask(dueDate);

        expect(titleInput().value).toBe(task.title);
        expect(descriptionInput().value).toBe(task.description);
        expect(statusTrigger().textContent?.trim()).toBe('En progreso');
        expect(dueDateTrigger().textContent).toContain(
          dueDate ? dateLabel(dueDate) : 'Sin vencimiento',
        );
        expect(closeState()).toEqual({ dirty: false, saving: false });
        expect(page.querySelectorAll('[role="alert"]')).toHaveLength(0);
        expect(api.create).not.toHaveBeenCalled();
        expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
      },
    );

    it('maps nullable description and due date to clean empty controls', async () => {
      const task = await loadTask(null);
      fixture.componentInstance.task.set({ ...task, description: null });
      await settle();

      expect(titleInput().value).toBe(task.title);
      expect(descriptionInput().value).toBe('');
      expect(statusTrigger().textContent?.trim()).toBe('En progreso');
      expect(dueDateTrigger().textContent).toContain('Sin vencimiento');
      expect(closeState()).toEqual({ dirty: false, saving: false });
      expect(api.create).not.toHaveBeenCalled();
      expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
    });

    it.each(['title', 'description'] as const)(
      'becomes dirty after changing %s and clean after restoring its original value',
      async (field) => {
        const task = await loadTask();
        const enterValue = field === 'title' ? enterTitle : enterDescription;
        await enterValue('Changed draft');
        expect(closeState()).toEqual({ dirty: true, saving: false });

        await enterValue(field === 'title' ? task.title : task.description!);
        expect(closeState()).toEqual({ dirty: false, saving: false });
        expect(api.create).not.toHaveBeenCalled();
        expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
      },
    );

    it('compares selected status with the original task rather than the creation default', async () => {
      await loadTask();
      await chooseStatus('pending');
      expect(closeState()).toEqual({ dirty: true, saving: false });

      await chooseStatus('in_progress');
      expect(closeState()).toEqual({ dirty: false, saving: false });
      expect(api.create).not.toHaveBeenCalled();
      expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
    });

    it('becomes clean after reselecting the original calendar day despite a different Date instance', async () => {
      await loadTask();
      clearDueDateButton().click();
      await settle();
      expect(closeState()).toEqual({ dirty: true, saving: false });

      await chooseDueDate('2026-10-26');
      expect(dueDateTrigger().textContent).toContain(dateLabel('2026-10-26'));
      expect(closeState()).toEqual({ dirty: false, saving: false });
      expect(api.create).not.toHaveBeenCalled();
      expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
    });
  });

  it('renders a labelled empty title without showing premature validation errors', () => {
    expect(page.querySelector('label[for="task-title"]')?.textContent?.trim()).toBe('Título');
    expect(titleInput().value).toBe('');
    expect(titleInput().required).toBe(true);
    expect(submitButton().textContent?.trim()).toBe('Crear tarea');
    expect(submitButton().disabled).toBe(false);
    expect(page.querySelectorAll('[role="alert"]')).toHaveLength(0);
    expect(api.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('rejects a blank title %j without submitting', async (title) => {
    await enterTitle(title);
    startSubmit();
    await settle();

    const error = page.querySelector('#task-title-error');
    expect(error?.textContent?.trim()).toBe('Ingresa un título.');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(titleInput().getAttribute('aria-invalid')).toBe('true');
    expect(titleInput().getAttribute('aria-describedby')).toBe('task-title-error');
    expect(titleInput().value).toBe(title);
    expect(api.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
  });

  it('rejects a title longer than 120 trimmed characters without submitting', async () => {
    const title = `  ${'x'.repeat(121)}  `;
    await enterTitle(title);
    startSubmit();
    await settle();

    expect(page.querySelector('#task-title-error')?.textContent?.trim()).toBe(
      'El título debe tener como máximo 120 caracteres.',
    );
    expect(titleInput().getAttribute('aria-invalid')).toBe('true');
    expect(titleInput().getAttribute('aria-describedby')).toBe('task-title-error');
    expect(titleInput().value).toBe(title);
    expect(api.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
  });

  it('accepts 120 trimmed characters, omits empty optional fields and emits the created task', async () => {
    const title = 'x'.repeat(120);
    const task = { ...created, title };
    api.create.mockResolvedValue(task);
    await enterTitle(`  ${title}  `);
    startSubmit();
    await settle();

    expect(api.create).toHaveBeenCalledExactlyOnceWith({ title, status: 'pending' });
    expect(api.update).not.toHaveBeenCalled();
    expect(page.querySelector('#task-title-error')).toBeNull();
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
    expect(page.querySelector('form')?.getAttribute('aria-busy')).toBe('false');
    expect(submitButton().disabled).toBe(false);
  });

  it('shows saving feedback and ignores a second submit while creation is pending', async () => {
    const pending = deferred<Task>();
    api.create.mockReturnValue(pending.promise);
    await enterTitle('  Prepare report  ');
    startSubmit();
    await settle();

    expect(page.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent?.trim()).toBe('Creando…');
    startSubmit();
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      title: 'Prepare report',
      status: 'pending',
    });
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();

    pending.resolve(created);
    await settle();
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(created);
    expect(page.querySelector('form')?.getAttribute('aria-busy')).toBe('false');
    expect(submitButton().disabled).toBe(false);
  });

  it('retains the title after failure and clears the error when retrying', async () => {
    api.create.mockRejectedValueOnce(new Error('Network unavailable'));
    await enterTitle('Prepare report');
    startSubmit();
    await settle();

    expect(page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos crear la tarea. Inténtalo de nuevo.',
    );
    expect(titleInput().value).toBe('Prepare report');
    expect(submitButton().disabled).toBe(false);
    expect(submitButton().textContent?.trim()).toBe('Crear tarea');
    expect(page.querySelector('form')?.getAttribute('aria-busy')).toBe('false');
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();

    const retry = deferred<Task>();
    api.create.mockReturnValueOnce(retry.promise);
    startSubmit();
    await settle();
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(submitButton().disabled).toBe(true);
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(api.create).toHaveBeenLastCalledWith({ title: 'Prepare report', status: 'pending' });

    retry.resolve(created);
    await settle();
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(created);
    expect(titleInput().value).toBe('Prepare report');
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(submitButton().disabled).toBe(false);
  });

  it('renders a labelled optional description without premature validation errors', () => {
    expect(page.querySelector('label[for="task-description"]')?.textContent?.trim()).toBe(
      'Descripción',
    );
    expect(descriptionInput().hasAttribute('z-textarea')).toBe(true);
    expect(descriptionInput().value).toBe('');
    expect(descriptionInput().required).toBe(false);
    expect(descriptionInput().getAttribute('aria-invalid')).not.toBe('true');
    expect(page.querySelector('#task-description-error')).toBeNull();
    expect(api.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
  });

  it('rejects a description over 2000 characters without submitting or discarding the draft', async () => {
    const description = ` ${'x'.repeat(1999)} `;
    await enterTitle('Prepare report');
    await enterDescription(description);
    startSubmit();
    await settle();

    const error = page.querySelector('#task-description-error');
    expect(error?.textContent?.trim()).toBe(
      'La descripción debe tener como máximo 2000 caracteres.',
    );
    expect(error?.getAttribute('role')).toBe('alert');
    expect(descriptionInput().getAttribute('aria-invalid')).toBe('true');
    expect(descriptionInput().getAttribute('aria-describedby')).toBe('task-description-error');
    expect(descriptionInput().value).toBe(description);
    expect(titleInput().value).toBe('Prepare report');
    expect(submitButton().disabled).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
  });

  it('accepts exactly 2000 description characters without trimming them', async () => {
    const description = ` ${'x'.repeat(1998)} `;
    const task = { ...created, description };
    api.create.mockResolvedValue(task);
    await enterTitle('  Prepare report  ');
    await enterDescription(description);
    startSubmit();
    await settle();

    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      title: 'Prepare report',
      description,
      status: 'pending',
    });
    expect(page.querySelector('#task-description-error')).toBeNull();
    expect(descriptionInput().value).toBe(description);
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
    expect(submitButton().disabled).toBe(false);
  });

  it('omits the description after the user clears it', async () => {
    await enterTitle('Prepare report');
    await enterDescription('Draft notes');
    await enterDescription('');
    startSubmit();
    await settle();

    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      title: 'Prepare report',
      status: 'pending',
    });
    expect(descriptionInput().value).toBe('');
    expect(page.querySelector('#task-description-error')).toBeNull();
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(created);
  });

  it('preserves a multiline description after failure and sends the same draft on retry', async () => {
    const description = '  First line\nSecond line  ';
    const task = { ...created, description };
    const input = { title: 'Prepare report', description, status: 'pending' };
    api.create.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(task);
    await enterTitle('Prepare report');
    await enterDescription(description);
    startSubmit();
    await settle();

    expect(api.create).toHaveBeenNthCalledWith(1, input);
    expect(page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos crear la tarea. Inténtalo de nuevo.',
    );
    expect(descriptionInput().value).toBe(description);
    expect(titleInput().value).toBe('Prepare report');
    expect(submitButton().disabled).toBe(false);
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();

    startSubmit();
    await settle();

    expect(api.create).toHaveBeenCalledTimes(2);
    expect(api.create).toHaveBeenNthCalledWith(2, input);
    expect(descriptionInput().value).toBe(description);
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
    expect(submitButton().disabled).toBe(false);
  });

  it('renders the official status Select with pending selected and all three supported choices', async () => {
    const trigger = statusTrigger();
    expect(trigger.textContent).toContain('Pendiente');
    expect(trigger.disabled).toBe(false);
    const group = trigger.closest('[role="group"]');
    const labelId = group?.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(page.querySelector(`#${labelId}`)?.textContent?.trim()).toBe('Estado');

    trigger.click();
    await settle();
    const options = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(
      options.map((option) => [option.getAttribute('value'), option.textContent?.trim()]),
    ).toEqual([
      ['pending', 'Pendiente'],
      ['in_progress', 'En progreso'],
      ['completed', 'Completada'],
    ]);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    options[0].click();
    await settle();
    expect(api.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'pending', label: 'Pendiente' },
    { status: 'in_progress', label: 'En progreso' },
    { status: 'completed', label: 'Completada' },
  ] as const)(
    'submits the selected $status status with the existing fields intact',
    async ({ status, label }) => {
      const description = '  Keep these notes  ';
      const task = { ...created, description, status };
      api.create.mockResolvedValue(task);
      await enterTitle('  Prepare report  ');
      await enterDescription(description);
      await chooseStatus(status);
      expect(statusTrigger().textContent).toContain(label);
      expect(api.create).not.toHaveBeenCalled();

      startSubmit();
      await settle();

      expect(api.create).toHaveBeenCalledExactlyOnceWith({
        title: 'Prepare report',
        description,
        status,
      });
      expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
      expect(submitButton().disabled).toBe(false);
    },
  );

  it('disables status selection while saving and restores it after completion', async () => {
    const pending = deferred<Task>();
    const task = { ...created, status: 'completed' as const };
    api.create.mockReturnValue(pending.promise);
    await enterTitle('Prepare report');
    await chooseStatus('completed');
    startSubmit();
    await settle();

    expect(statusTrigger().disabled).toBe(true);
    statusTrigger().click();
    await settle();
    expect(statusTrigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      title: 'Prepare report',
      status: 'completed',
    });
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();

    pending.resolve(task);
    await settle();
    expect(statusTrigger().disabled).toBe(false);
    expect(statusTrigger().textContent).toContain('Completada');
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
  });

  it('retains the selected status after failure and retries with the same value', async () => {
    const task = { ...created, status: 'in_progress' as const };
    api.create.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(task);
    await enterTitle('Prepare report');
    await chooseStatus('in_progress');
    startSubmit();
    await settle();

    expect(page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos crear la tarea. Inténtalo de nuevo.',
    );
    expect(statusTrigger().textContent).toContain('En progreso');
    expect(statusTrigger().disabled).toBe(false);
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();

    startSubmit();
    await settle();
    expect(api.create).toHaveBeenCalledTimes(2);
    for (const call of [1, 2]) {
      expect(api.create).toHaveBeenNthCalledWith(call, {
        title: 'Prepare report',
        status: 'in_progress',
      });
    }
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(statusTrigger().textContent).toContain('En progreso');
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
  });

  it('renders a labelled optional date picker and omits an unselected due date', async () => {
    expect(dueDateTrigger().textContent).toContain('Sin vencimiento');
    expect(dueDateTrigger().disabled).toBe(false);
    expect(page.textContent).not.toContain('Limpiar vencimiento');
    expect(api.create).not.toHaveBeenCalled();
    await enterTitle('Prepare report');
    startSubmit();
    await settle();

    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      title: 'Prepare report',
      status: 'pending',
    });
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(created);
  });

  it.each(['2026-10-25', '2024-02-29'])(
    'submits selected calendar date %s without shifting the day or changing other fields',
    async (dueDate) => {
      const description = '  Keep these notes  ';
      const task = { ...created, description, dueDate, status: 'completed' as const };
      api.create.mockResolvedValue(task);
      await enterTitle('  Prepare report  ');
      await enterDescription(description);
      await chooseStatus('completed');
      await chooseDueDate(dueDate);
      expect(dueDateTrigger().textContent).toContain(dateLabel(dueDate));
      expect(api.create).not.toHaveBeenCalled();
      startSubmit();
      await settle();

      expect(api.create).toHaveBeenCalledExactlyOnceWith({
        title: 'Prepare report',
        description,
        status: 'completed',
        dueDate,
      });
      expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
      expect(dueDateTrigger().textContent).toContain(dateLabel(dueDate));
    },
  );

  it('omits a cleared due date while preserving the title, description and selected status', async () => {
    const description = 'Draft notes';
    const task = { ...created, description, status: 'in_progress' as const };
    api.create.mockResolvedValue(task);
    await enterTitle('Prepare report');
    await enterDescription(description);
    await chooseStatus('in_progress');
    await chooseDueDate('2026-10-25');
    expect(clearDueDateButton().type).toBe('button');
    clearDueDateButton().click();
    await settle();

    expect(dueDateTrigger().textContent).toContain('Sin vencimiento');
    expect(api.create).not.toHaveBeenCalled();
    expect(titleInput().value).toBe('Prepare report');
    expect(descriptionInput().value).toBe(description);
    expect(statusTrigger().textContent).toContain('En progreso');
    startSubmit();
    await settle();
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      title: 'Prepare report',
      description,
      status: 'in_progress',
    });
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
  });

  it('disables the picker and clear action while saving and restores them afterwards', async () => {
    const dueDate = '2026-10-25';
    const task = { ...created, dueDate };
    const pending = deferred<Task>();
    api.create.mockReturnValue(pending.promise);
    await enterTitle('Prepare report');
    await chooseDueDate(dueDate);
    startSubmit();
    await settle();

    expect(dueDateTrigger().disabled).toBe(true);
    expect(clearDueDateButton().disabled).toBe(true);
    dueDateTrigger().click();
    clearDueDateButton().click();
    await settle();
    expect(document.body.querySelector('z-calendar')).toBeNull();
    expect(dueDateTrigger().textContent).toContain(dateLabel(dueDate));
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      title: 'Prepare report',
      status: 'pending',
      dueDate,
    });
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();

    pending.resolve(task);
    await settle();
    expect(dueDateTrigger().disabled).toBe(false);
    expect(clearDueDateButton().disabled).toBe(false);
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
  });

  it('preserves the selected due date after failure and retries with the same calendar day', async () => {
    const dueDate = '2026-10-25';
    const task = { ...created, dueDate };
    api.create.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(task);
    await enterTitle('Prepare report');
    await chooseDueDate(dueDate);
    startSubmit();
    await settle();

    expect(page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos crear la tarea. Inténtalo de nuevo.',
    );
    expect(dueDateTrigger().textContent).toContain(dateLabel(dueDate));
    expect(dueDateTrigger().disabled).toBe(false);
    expect(clearDueDateButton().disabled).toBe(false);
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();

    startSubmit();
    await settle();
    expect(api.create).toHaveBeenCalledTimes(2);
    for (const call of [1, 2]) {
      expect(api.create).toHaveBeenNthCalledWith(call, {
        title: 'Prepare report',
        status: 'pending',
        dueDate,
      });
    }
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(dueDateTrigger().textContent).toContain(dateLabel(dueDate));
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(task);
  });

  it.each(['', ' \n\t '])('rejects blank title %j without submitting or saving', async (title) => {
    await enterTitle(title);
    startSubmit();
    await settle();

    expect(page.querySelector('#task-title-error')?.textContent?.trim()).toBe('Ingresa un título.');
    expect(titleInput().value).toBe(title.replace(/[\r\n]/g, ''));
    expect(api.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();
  });

  it('rejects excessive lengths and then submits supported boundary fields unchanged', async () => {
    const title = 'x'.repeat(120);
    const description = ' ' + 'd'.repeat(1998) + ' ';
    await enterTitle(title + 'x');
    await enterDescription(description + 'd');
    startSubmit();
    await settle();

    expect(page.querySelector('#task-title-error')?.textContent?.trim()).toBe(
      'El título debe tener como máximo 120 caracteres.',
    );
    expect(page.querySelector('#task-description-error')?.textContent?.trim()).toBe(
      'La descripción debe tener como máximo 2000 caracteres.',
    );
    expect(titleInput().value).toBe(title + 'x');
    expect(descriptionInput().value).toBe(description + 'd');
    expect(api.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.onSaved).not.toHaveBeenCalled();

    await enterTitle(' ' + title + ' ');
    await enterDescription(description);
    await chooseStatus('completed');
    await chooseDueDate('2024-02-29');
    startSubmit();
    await settle();
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      title,
      description,
      status: 'completed',
      dueDate: '2024-02-29',
    });
    expect(fixture.componentInstance.onSaved).toHaveBeenCalledExactlyOnceWith(created);
  });
});
