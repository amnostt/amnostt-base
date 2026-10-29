import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEraser } from '@ng-icons/lucide';
import type { CalendarValue } from '@/shared/zard/components/calendar';
import { ZardButtonComponent } from '@/shared/zard/components/button';
import { ZardDatePickerComponent } from '@/shared/zard/components/date-picker';
import { ZardFieldImports } from '@/shared/zard/components/field';
import { ZardInputComponent } from '@/shared/zard/components/input';
import { ZardSelectImports } from '@/shared/zard/components/select';
import type { TaskQueryState } from '../../../../domain/task-query';

@Component({
  selector: 'app-task-filters',
  imports: [
    ZardButtonComponent,
    ZardDatePickerComponent,
    ZardFieldImports,
    ZardInputComponent,
    ZardSelectImports,
    NgIcon,
  ],
  viewProviders: [provideIcons({ lucideEraser })],
  host: { class: 'block shrink-0' },
  templateUrl: './task-filters.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class TaskFilters {
  readonly query = input.required<TaskQueryState>();
  readonly searchText = input.required<string>();
  readonly searchChange = output<string>();
  readonly statusChange = output<string | string[]>();
  readonly dueDateChange = output<CalendarValue>();

  protected readonly dueDateValue = computed(() => {
    const value = this.query().dueDate;
    if (!value) return null;

    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  });

  protected onSearchInput(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) this.searchChange.emit(input.value);
  }
}
