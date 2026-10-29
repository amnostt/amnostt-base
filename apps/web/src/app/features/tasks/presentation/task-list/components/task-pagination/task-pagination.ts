import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { ZardPaginationImports } from '@/shared/zard/components/pagination';
import { ZardSelectImports } from '@/shared/zard/components/select';
import type { TaskListResponse } from '../../../../domain/task-model';

export const TASK_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

@Component({
  selector: 'app-task-pagination',
  imports: [ZardPaginationImports, ZardSelectImports],
  host: { class: 'flex shrink-0 flex-wrap items-center justify-between gap-4' },
  templateUrl: './task-pagination.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class TaskPagination {
  readonly meta = input<TaskListResponse['meta'] | null>(null);
  readonly page = input.required<number>();
  readonly limit = input.required<number>();
  readonly ready = input.required<boolean>();
  readonly showTotal = input.required<boolean>();
  readonly limitChange = output<string | string[]>();
  readonly pageChange = output<number>();

  protected readonly pageSizeOptions = TASK_PAGE_SIZE_OPTIONS;
}
