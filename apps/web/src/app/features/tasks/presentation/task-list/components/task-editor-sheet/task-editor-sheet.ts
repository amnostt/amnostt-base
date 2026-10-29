import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ZardAlertDialogRef, ZardAlertDialogService } from '@/shared/zard/components/alert-dialog';
import { ZardSheetComponent, ZardSheetImports } from '@/shared/zard/components/sheet';
import type { Task } from '../../../../domain/task-model';
import { TaskForm } from '../../../task-form/task-form';

@Component({
  selector: 'app-task-editor-sheet',
  imports: [ZardSheetImports, TaskForm],
  host: { class: 'contents' },
  templateUrl: './task-editor-sheet.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class TaskEditorSheet {
  private readonly alertDialog = inject(ZardAlertDialogService);
  private readonly createForm = viewChild(TaskForm);
  private discardDialog: ZardAlertDialogRef<void> | null = null;

  readonly task = input<Task | null>(null);
  readonly visible = input.required<boolean>();
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 767.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.discardDialog?.close());
  }

  protected onVisibleChange(visible: boolean, sheet: ZardSheetComponent): void {
    if (visible) return;
    const state = this.createForm()?.getCloseState();

    if (!state || (!state.saving && !state.dirty)) {
      this.closed.emit();
      return;
    }

    sheet.zVisible.set(true);

    if (state.saving || this.discardDialog) return;

    this.discardDialog = this.alertDialog.create<void>({
      zTitle: '¿Descartar los cambios?',
      zDescription: 'Los cambios sin guardar se perderán.',
      zCancelText: 'Seguir editando',
      zOkText: 'Descartar',
      zOkDestructive: true,
      zMaskClosable: false,
      zOnCancel: () => {
        this.discardDialog = null;
      },
      zOnOk: () => {
        this.discardDialog = null;
        this.closed.emit();
      },
    });
  }
}
