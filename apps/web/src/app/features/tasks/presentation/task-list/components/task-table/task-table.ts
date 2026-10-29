import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowUp,
  lucideArrowUpDown,
  lucideChevronDown,
} from '@ng-icons/lucide';
import { ZardButtonComponent } from '@/shared/zard/components/button';
import { ZardContextMenuImports } from '@/shared/zard/components/context-menu';
import { ZardDropdownImports } from '@/shared/zard/components/dropdown';
import { ZardTableImports } from '@/shared/zard/components/table';
import type { Task } from '../../../../domain/task-model';
import type { TaskQueryState } from '../../../../domain/task-query';

export interface TaskTableRow {
  task: Task;
  canEdit: boolean;
  canDelete: boolean;
}

@Component({
  selector: 'app-task-table',
  imports: [
    ZardButtonComponent,
    ZardContextMenuImports,
    ZardDropdownImports,
    ZardTableImports,
    NgIcon,
  ],
  viewProviders: [
    provideIcons({ lucideArrowDown, lucideArrowUp, lucideArrowUpDown, lucideChevronDown }),
  ],
  host: { class: 'flex min-h-0 min-w-0 flex-1 flex-col' },
  templateUrl: './task-table.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class TaskTable {
  readonly rows = input.required<TaskTableRow[]>();
  readonly sort = input.required<TaskQueryState['sort']>();
  readonly sortChange = output<'title' | 'dueDate'>();
  readonly edit = output<Task>();
  readonly delete = output<Task>();

  protected columnSort(field: 'title' | 'dueDate'): 'ascending' | 'descending' | null {
    const sort = this.sort();
    if (sort === field) return 'ascending';
    if (sort === `-${field}`) return 'descending';
    return null;
  }

  protected columnIcon(field: 'title' | 'dueDate'): string {
    const direction = this.columnSort(field);
    return direction === 'ascending'
      ? 'lucideArrowUp'
      : direction === 'descending'
        ? 'lucideArrowDown'
        : 'lucideArrowUpDown';
  }
}
