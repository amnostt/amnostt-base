import {
  Component,
  DestroyRef,
  inject,
  type OnInit,
  signal,
  computed,
  viewChild,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { canCreateTasks } from '../../domain/task-permissions';
import { SessionStore } from '@/features/auth/application/session-store';
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
import { ZardSheetImports } from '@/shared/zard/components/sheet';
import { ZardSheetComponent } from '@/shared/zard/components/sheet';
import { ZardAlertDialogService } from '@/shared/zard/components/alert-dialog';
import { ZardAlertDialogRef } from '@/shared/zard/components/alert-dialog';
import { ZardDropdownService } from '@/shared/zard/components/dropdown';
import { ZardContextMenuImports } from '@/shared/zard/components/context-menu';

import type { CalendarValue } from '@/shared/zard/components/calendar';
import { TaskForm } from '../task-form/task-form';
import { Task } from '../../domain/task-model';
import { canUpdateTask } from '../../domain/task-permissions';

import {
  parseTaskQuery,
  serializeTaskQuery,
  TASK_QUERY_DEFAULTS,
  updateTaskQuery,
  type TaskQueryState,
} from '../../domain/task-query';
import { distinctUntilChanged, EMPTY, map, Subject, switchMap, timer } from 'rxjs';
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
    ZardContextMenuImports,
    ZardSheetImports,
    TaskForm,
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
  private readonly session = inject(SessionStore);
  private readonly breakpoints = inject(BreakpointObserver);

  private readonly createForm = viewChild(TaskForm);
  private readonly alertDialog = inject(ZardAlertDialogService);
  private discardDialog: ZardAlertDialogRef<void> | null = null;

  private readonly dropdown = inject(ZardDropdownService);

  private readonly searchChanges = new Subject<string | null>();
  private requestRevision = 0;

  protected readonly editorOpen = signal(false);

  protected readonly selectedTask = signal<Task | null>(null);

  protected readonly canUseForm = computed(() => {
    const state = this.session.state();
    if (state.status !== 'authenticated') return false;

    const task = this.selectedTask();

    return task ? canUpdateTask(state.user, task) : canCreateTasks(state.user);
  });

  protected readonly canCreate = computed(() => {
    const state = this.session.state();

    return state.status === 'authenticated' && canCreateTasks(state.user);
  });

  protected canEdit(task: Task): boolean {
    const state = this.session.state();

    return state.status === 'authenticated' && canUpdateTask(state.user, task);
  }

  protected openCreate(): void {
    if (!this.canCreate()) return;

    this.selectedTask.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(task: Task): void {
    if (!this.canEdit(task)) return;

    this.dropdown.close();
    this.selectedTask.set(task);
    this.editorOpen.set(true);
  }

  protected readonly isMobile = toSignal(
    this.breakpoints.observe('(max-width: 767.98px)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );

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

  protected onCreateVisibleChange(visible: boolean, sheet: ZardSheetComponent): void {
    if (visible) return;
    const state = this.createForm()?.getCloseState();

    if (!state || (!state.saving && !state.dirty)) {
      this.editorOpen.set(false);
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
        this.editorOpen.set(false);
      },
    });
  }

  protected onTaskSaved(): void {
    this.editorOpen.set(false);
    void this.load();
  }

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
      this.discardDialog?.close();
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
