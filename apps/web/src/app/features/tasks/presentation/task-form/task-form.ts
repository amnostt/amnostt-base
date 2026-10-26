import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
  computed,
  effect,
  input,
  untracked,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type ValidatorFn,
} from '@angular/forms';
import type { Task, TaskStatus } from '../../domain/task-model';
import { TasksApi } from '../../infrastructure/tasks-api';

import { ZardButtonComponent } from '@/shared/zard/components/button';
import { ZardFieldImports } from '@/shared/zard/components/field';
import { ZardInputComponent } from '@/shared/zard/components/input';
import { ZardTextareaComponent } from '@/shared/zard/components/textarea';
import { ZardDatePickerComponent } from '@/shared/zard/components/date-picker';
import { ZardSelectImports } from '@/shared/zard/components/select';

const titleValidator: ValidatorFn = (control) => {
  const title = String(control.value ?? '').trim();

  if (!title) return { required: true };
  if (title.length > 120) return { maxlength: true };

  return null;
};

@Component({
  imports: [
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardInputComponent,
    ZardTextareaComponent,
    ZardDatePickerComponent,
    ...ZardFieldImports,
    ...ZardSelectImports,
  ],
  selector: 'app-task-form',
  styleUrl: './task-form.css',
  templateUrl: './task-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskForm {
  private readonly api = inject(TasksApi);

  readonly saved = output<Task>();
  readonly task = input<Task | null>(null);

  private readonly initialValues = computed(() => {
    const task = this.task();
    const date = task?.dueDate?.split('-').map(Number);

    return {
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? 'pending',
      dueDate: date ? new Date(date[0], date[1] - 1, date[2], 12) : null,
    };
  });

  constructor() {
    effect(() => {
      const values = this.initialValues();
      untracked(() => this.taskForm.reset(values));
    });
  }

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly taskForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [titleValidator],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
    status: new FormControl<TaskStatus>('pending', {
      nonNullable: true,
    }),
    dueDate: new FormControl<Date | null>(null),
  });

  protected async onSubmit(): Promise<void> {
    if (this.saving()) return;

    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }

    const editingTask = this.task();

    this.saving.set(true);
    this.errorMessage.set(null);

    try {
      const description = this.taskForm.controls.description.value;
      const date = this.taskForm.controls.dueDate.value;
      const dueDate = date
        ? [
            String(date.getFullYear()).padStart(4, '0'),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0'),
          ].join('-')
        : undefined;

      const base = {
        title: this.taskForm.controls.title.value.trim(),
        status: this.taskForm.controls.status.value,
      };

      const task = editingTask
        ? await this.api.update(editingTask.id, {
            ...base,
            description: description || null,
            dueDate: dueDate ?? null,
          })
        : await this.api.create({
            ...base,
            ...(description ? { description } : {}),
            ...(dueDate ? { dueDate } : {}),
          });

      this.saved.emit(task);
    } catch {
      this.errorMessage.set(
        editingTask
          ? 'No pudimos actualizar la tarea. Inténtalo de nuevo.'
          : 'No pudimos crear la tarea. Inténtalo de nuevo.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  getCloseState(): { dirty: boolean; saving: boolean } {
    const values = this.taskForm.getRawValue();
    const initial = this.initialValues();

    return {
      saving: this.saving(),
      dirty:
        values.title !== initial.title ||
        values.description !== initial.description ||
        values.status !== initial.status ||
        values.dueDate?.toDateString() !== initial.dueDate?.toDateString(),
    };
  }
}
