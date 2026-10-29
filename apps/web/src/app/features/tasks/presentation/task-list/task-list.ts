import { Component, DestroyRef, computed, inject, signal, type OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';
import { distinctUntilChanged, EMPTY, map, Subject, switchMap, timer } from 'rxjs';

import { SessionStore } from '@/features/auth/application/session-store';
import { ZardAlertDialogRef, ZardAlertDialogService } from '@/shared/zard/components/alert-dialog';
import { ZardButtonComponent } from '@/shared/zard/components/button';
import type { CalendarValue } from '@/shared/zard/components/calendar';
import { ZardDropdownService } from '@/shared/zard/components/dropdown';

import { Task, type TaskListResponse } from '../../domain/task-model';
import { canCreateTasks, canDeleteTask, canUpdateTask } from '../../domain/task-permissions';
import {
  parseTaskQuery,
  serializeTaskQuery,
  TASK_QUERY_DEFAULTS,
  updateTaskQuery,
  type TaskQueryState,
} from '../../domain/task-query';
import { TasksApi } from '../../infrastructure/tasks-api';

import { TaskEditorSheet } from './components/task-editor-sheet/task-editor-sheet';
import { TaskFilters } from './components/task-filters/task-filters';
import {
  TaskPagination,
  TASK_PAGE_SIZE_OPTIONS,
} from './components/task-pagination/task-pagination';
import { TaskTable, type TaskTableRow } from './components/task-table/task-table';

type TaskListState =
  { status: 'loading' } | { status: 'ready'; response: TaskListResponse } | { status: 'error' };

@Component({
  imports: [ZardButtonComponent, TaskFilters, TaskTable, TaskPagination, TaskEditorSheet, NgIcon],
  viewProviders: [
    provideIcons({
      lucidePlus,
    }),
  ],
  selector: 'app-task-list',
  host: { class: 'flex min-h-0 min-w-0 flex-1 flex-col' },
  styleUrl: './task-list.css',
  templateUrl: './task-list.html',
})
export class TaskList implements OnInit {
  private readonly api = inject(TasksApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionStore);
  private readonly alertDialog = inject(ZardAlertDialogService);
  private readonly dropdown = inject(ZardDropdownService);

  protected readonly state = signal<TaskListState>({
    status: 'loading',
  });

  protected readonly query = signal<TaskQueryState>({ ...TASK_QUERY_DEFAULTS });

  protected readonly searchText = signal('');

  protected readonly paginationMeta = signal<TaskListResponse['meta'] | null>(null);

  private readonly searchChanges = new Subject<string | null>();

  private requestRevision = 0;

  protected readonly editorOpen = signal(false);

  protected readonly selectedTask = signal<Task | null>(null);

  protected readonly deletingTask = signal<Task | null>(null);

  protected readonly deletionFeedback = signal<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  private deleteDialog: ZardAlertDialogRef<void> | null = null;

  protected readonly tableRows = computed<TaskTableRow[]>(() => {
    const state = this.state();
    if (state.status !== 'ready') return [];

    return state.response.data.map((task) => ({
      task,
      canEdit: this.canEdit(task),
      canDelete: this.canDelete(task),
    }));
  });

  protected readonly canCreate = computed(() => {
    const state = this.session.state();

    return state.status === 'authenticated' && canCreateTasks(state.user);
  });

  protected readonly canUseForm = computed(() => {
    const state = this.session.state();
    if (state.status !== 'authenticated') return false;

    const task = this.selectedTask();

    return task ? canUpdateTask(state.user, task) : canCreateTasks(state.user);
  });

  protected canEdit(task: Task): boolean {
    const state = this.session.state();

    return state.status === 'authenticated' && canUpdateTask(state.user, task);
  }

  protected canDelete(task: Task): boolean {
    const state = this.session.state();

    return (
      !this.deletingTask() && state.status === 'authenticated' && canDeleteTask(state.user, task)
    );
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.requestRevision++;
      this.deleteDialog?.close();
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

  protected toggleColumnSort(field: 'title' | 'dueDate'): void {
    const sort: TaskQueryState['sort'] = this.query().sort === field ? `-${field}` : field;
    const nextQuery = updateTaskQuery(serializeTaskQuery(this.query()), { sort });

    void this.router.navigateByUrl(`/tasks${nextQuery}`);
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

  protected changeSearch(value: string): void {
    this.searchText.set(value);
    this.searchChanges.next(value);
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

  protected changeLimit(value: string | string[]): void {
    const limit = TASK_PAGE_SIZE_OPTIONS.find((size) => String(size) === value);

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

  protected onTaskSaved(): void {
    this.editorOpen.set(false);
    void this.load();
  }

  protected requestDelete(task: Task): void {
    if (!this.canDelete(task)) return;
    if (this.deleteDialog && !this.deleteDialog.isClosing()) return;

    this.dropdown.close();

    this.deleteDialog = this.alertDialog.create<void>({
      zTitle: `¿Eliminar "${task.title}"?`,
      zDescription: 'Esta acción no se puede deshacer.',
      zCancelText: 'Cancelar',
      zOkText: 'Eliminar',
      zOkDestructive: true,
      zMaskClosable: false,
      zOnOk: () => {
        void this.removeTask(task);
      },
    });
  }

  private async removeTask(task: Task): Promise<void> {
    if (!this.canDelete(task)) return;

    const session = this.session.state();

    this.deletingTask.set(task);
    this.deletionFeedback.set(null);

    try {
      await this.api.remove(task.id);

      if (this.destroyRef.destroyed || this.session.state() !== session) return;

      this.deletionFeedback.set({
        kind: 'success',
        message: 'Tarea eliminada.',
      });

      void this.load();
    } catch {
      if (this.destroyRef.destroyed || this.session.state() !== session) return;

      this.deletionFeedback.set({
        kind: 'error',
        message: 'No pudimos eliminar la tarea. Inténtalo de nuevo.',
      });
    } finally {
      if (!this.destroyRef.destroyed) {
        this.deletingTask.set(null);
      }
    }
  }
}
