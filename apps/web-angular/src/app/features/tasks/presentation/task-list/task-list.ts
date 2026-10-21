import { Component, DestroyRef, inject, type OnInit, signal, computed } from '@angular/core';
import type { TaskListResponse } from '../../domain/task-model';
import { TasksApi } from '../../infrastructure/tasks-api';
import { ZardButtonComponent } from '@/shared/zard/components/button';
import { ZardInputComponent } from '@/shared/zard/components/input';
import { ZardDatePickerComponent } from '@/shared/zard/components/date-picker';
import { ZardFieldImports } from '@/shared/zard/components/field';
import { ZardSelectImports } from '@/shared/zard/components/select';
import { ZardTableImports } from '@/shared/zard/components/table';
import { ZardDropdownImports } from '@/shared/zard/components/dropdown';
import { ZardPaginationImports } from '@/shared/zard/components/pagination';
import { ActivatedRoute, Router } from '@angular/router';
import type { CalendarValue } from '@/shared/zard/components/calendar';

import {
  parseTaskQuery,
  serializeTaskQuery,
  TASK_QUERY_DEFAULTS,
  updateTaskQuery,
  type TaskQueryState,
} from '../../domain/task-query';
import { distinctUntilChanged, EMPTY, map, Subject, switchMap, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  lucideArrowDown,
  lucideArrowUp,
  lucideArrowUpDown,
  lucideChevronDown,
} from '@ng-icons/lucide';
import { NgIcon, provideIcons } from '@ng-icons/core';

type TaskListState =
  { status: 'loading' } | { status: 'ready'; response: TaskListResponse } | { status: 'error' };

@Component({
  imports: [
    ZardButtonComponent,
    ZardInputComponent,
    ZardDatePickerComponent,
    ZardSelectImports,
    ZardFieldImports,
    ZardTableImports,
    ZardDropdownImports,
    ZardPaginationImports,
    NgIcon,
  ],
  viewProviders: [
    provideIcons({
      lucideArrowDown,
      lucideArrowUp,
      lucideArrowUpDown,
      lucideChevronDown,
    }),
  ],
  selector: 'app-task-list',
  styleUrl: './task-list.css',
  templateUrl: './task-list.html',
})
export class TaskList implements OnInit {
  private readonly api = inject(TasksApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchChanges = new Subject<string | null>();
  private requestRevision = 0;

  protected readonly state = signal<TaskListState>({
    status: 'loading',
  });

  protected readonly query = signal<TaskQueryState>({ ...TASK_QUERY_DEFAULTS });
  protected readonly dueDateValue = computed(() => {
    const value = this.query().dueDate;
    if (!value) return null;

    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  });

  protected readonly searchText = signal('');

  protected readonly sortOptions = [
    { value: '-createdAt', label: 'Más recientes' },
    { value: 'createdAt', label: 'Más antiguas' },
    { value: '-updatedAt', label: 'Actualización más reciente' },
    { value: 'updatedAt', label: 'Actualización más antigua' },
    { value: 'dueDate', label: 'Vencimiento más próximo' },
    { value: '-dueDate', label: 'Vencimiento más lejano' },
    { value: 'title', label: 'Título: A–Z' },
    { value: '-title', label: 'Título: Z–A' },
  ] as const;

  protected readonly secondarySortOptions = this.sortOptions.filter(
    ({ value }) =>
      value === 'createdAt' ||
      value === '-createdAt' ||
      value === 'updatedAt' ||
      value === '-updatedAt',
  );

  protected readonly currentSortLabel = computed(
    () =>
      this.sortOptions.find((option) => option.value === this.query().sort)?.label ??
      'Más recientes',
  );

  protected readonly pageSizeOptions = [10, 20, 50, 100] as const;

  protected readonly paginationMeta = signal<TaskListResponse['meta'] | null>(null);

  protected toggleColumnSort(field: 'title' | 'dueDate'): void {
    this.changeSort(this.query().sort === field ? `-${field}` : field);
  }

  protected columnSort(field: 'title' | 'dueDate'): 'ascending' | 'descending' | null {
    const sort = this.query().sort;

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

  protected changeStatus(value: string | string[]): void {
    if (
      value !== 'all' &&
      value !== 'pending' &&
      value !== 'in_progress' &&
      value !== 'completed'
    ) {
      return;
    }

    const nextQuery = updateTaskQuery(serializeTaskQuery(this.query()), {
      status: value === 'all' ? '' : value,
    });

    void this.router.navigateByUrl(`/tasks${nextQuery}`);
  }

  protected changeSearch(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    this.searchText.set(input.value);
    this.searchChanges.next(input.value);
  }

  protected changeDueDate(value: CalendarValue): void {
    if (Array.isArray(value)) return;
    if (value && Number.isNaN(value.getTime())) return;

    const dueDate = value
      ? [
          String(value.getFullYear()).padStart(4, '0'),
          String(value.getMonth() + 1).padStart(2, '0'),
          String(value.getDate()).padStart(2, '0'),
        ].join('-')
      : '';

    if (dueDate === this.query().dueDate) return;

    const nextQuery = updateTaskQuery(serializeTaskQuery(this.query()), { dueDate });

    void this.router.navigateByUrl(`/tasks${nextQuery}`);
  }

  protected changeSort(value: string | string[]): void {
    const option = this.sortOptions.find((item) => item.value === value);

    if (!option || option.value === this.query().sort) return;

    const nextQuery = updateTaskQuery(serializeTaskQuery(this.query()), { sort: option.value });

    void this.router.navigateByUrl(`/tasks${nextQuery}`);
  }

  protected changeLimit(value: string | string[]): void {
    const limit = this.pageSizeOptions.find((size) => String(size) === value);

    if (limit === undefined || limit === this.query().limit) return;

    const nextQuery = updateTaskQuery(serializeTaskQuery(this.query()), { limit });

    void this.router.navigateByUrl(`/tasks${nextQuery}`);
  }

  protected changePage(page: number): void {
    const meta = this.paginationMeta();

    if (
      this.state().status !== 'ready' ||
      !meta ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > meta.totalPages ||
      page === this.query().page
    ) {
      return;
    }

    const nextQuery = updateTaskQuery(serializeTaskQuery(this.query()), { page });

    void this.router.navigateByUrl(`/tasks${nextQuery}`);
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.requestRevision++;
    });

    this.searchChanges
      .pipe(
        switchMap((value) => (value === null ? EMPTY : timer(300).pipe(map(() => value.trim())))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((search) => {
        if (search === this.query().search) return;

        const nextQuery = updateTaskQuery(serializeTaskQuery(this.query()), { search });

        void this.router.navigateByUrl(`/tasks${nextQuery}`);
      });

    this.route.queryParamMap
      .pipe(
        map((params) => {
          const search = new URLSearchParams();

          for (const key of params.keys) {
            search.set(key, params.get(key) ?? '');
          }

          return parseTaskQuery(search.toString());
        }),
        distinctUntilChanged(
          (previous, current) => serializeTaskQuery(previous) === serializeTaskQuery(current),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((query) => {
        this.searchChanges.next(null);
        this.query.set(query);
        this.searchText.set(query.search);
        void this.load();
      });
  }

  protected async load(): Promise<void> {
    const revision = ++this.requestRevision;
    this.state.set({ status: 'loading' });

    try {
      const response = await this.api.list(this.query());

      if (revision !== this.requestRevision) return;

      this.paginationMeta.set(response.meta);
      this.state.set({ status: 'ready', response });
    } catch {
      if (revision !== this.requestRevision) return;

      this.state.set({ status: 'error' });
    }
  }
}
