import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
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

      const task = await this.api.create({
        title: this.taskForm.controls.title.value.trim(),
        status: this.taskForm.controls.status.value,
        ...(description ? { description } : {}),
        ...(dueDate ? { dueDate } : {}),
      });

      this.saved.emit(task);
    } catch {
      this.errorMessage.set('No pudimos crear la tarea. Inténtalo de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  getCloseState(): { dirty: boolean; saving: boolean } {
    const values = this.taskForm.getRawValue();

    return {
      saving: this.saving(),
      dirty:
        values.title !== '' ||
        values.description !== '' ||
        values.status !== 'pending' ||
        values.dueDate !== null,
    };
  }
}
