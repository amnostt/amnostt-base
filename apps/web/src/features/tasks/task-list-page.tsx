import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Sheet } from '@/components/ui/sheet';
import { Toast } from '@/components/ui/toast';
import { useSession } from '../auth/components/session-provider';
import { TaskForm } from './task-form';
import { canShowTaskRowAction } from './task-permissions';
import { createTaskRepository, deleteTask } from './task-repository';
import type { Task } from './task-models';
import {
  parseTaskQuery,
  serializeTaskQuery,
  TASK_SORT_OPTIONS,
  TASK_STATUS_OPTIONS,
  type TaskQueryChanges,
  type TaskQueryState,
  updateTaskQuery,
} from './task-query';

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tasks: Task[]; totalItems: number; totalPages: number };

type EditState =
  | { status: 'idle' }
  | { status: 'error'; id: string }
  | { status: 'ready'; id: string; task: Task };

export function TaskListPage() {
  const { snapshot, request, requestResponse } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const userId =
    snapshot.status === 'authenticated' ? snapshot.user.id : undefined;
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [editState, setEditState] = useState<EditState>({ status: 'idle' });
  const [deleteTarget, setDeleteTarget] = useState<Task>();
  const [deletingId, setDeletingId] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const deletingRef = useRef<string | undefined>(undefined);
  const previousQueryRef = useRef<string | undefined>(undefined);
  const queryState = parseTaskQuery(location.search);
  const query = serializeTaskQuery(queryState);
  const toast = (location.state as { toast?: string } | null)?.toast;
  const canCreate =
    snapshot.status === 'authenticated' &&
    (snapshot.user.permissions.includes('tasks:create:own') ||
      snapshot.user.permissions.includes('tasks:create:any'));

  useEffect(() => {
    if (!userId) return;

    const previousQuery = previousQueryRef.current;
    previousQueryRef.current = query;
    const searchChanged =
      previousQuery !== undefined &&
      parseTaskQuery(previousQuery).search !== queryState.search;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(
      () => {
        void createTaskRepository(requestResponse)
          .list(query, controller.signal)
          .then((response) => {
            if (active && !controller.signal.aborted)
              setState({
                status: 'ready',
                tasks: response.data,
                totalItems: response.meta?.totalItems ?? response.data.length,
                totalPages: response.meta?.totalPages ?? 0,
              });
          })
          .catch(() => {
            if (active && !controller.signal.aborted)
              setState({ status: 'error' });
          });
      },
      searchChanged ? 300 : 0,
    );

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    attempt,
    location.pathname,
    query,
    queryState.search,
    requestResponse,
    userId,
  ]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void request<Task>(`/tasks/${id}`)
      .then((task) => {
        if (active) setEditState({ status: 'ready', id, task });
      })
      .catch(() => {
        if (active) setEditState({ status: 'error', id });
      });
    return () => {
      active = false;
    };
  }, [id, request]);

  const hasCriteria = hasTaskCriteria(queryState);

  function updateQuery(changes: TaskQueryChanges) {
    navigate(
      `${location.pathname}${updateTaskQuery(location.search, changes)}`,
      { replace: true },
    );
  }

  function requestDelete(task: Task) {
    setDeleteError(undefined);
    setDeleteTarget(task);
  }

  async function confirmDelete() {
    if (!deleteTarget || deletingRef.current) return;

    const taskId = deleteTarget.id;
    deletingRef.current = taskId;
    setDeletingId(taskId);
    setDeleteError(undefined);
    try {
      await deleteTask(request, taskId);
      setDeleteTarget(undefined);
      setState({ status: 'loading' });
      setAttempt((value) => value + 1);
      navigate(`/tasks${query}`, { state: { toast: 'Task deleted.' } });
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Unable to delete task.',
      );
    } finally {
      deletingRef.current = undefined;
      setDeletingId(undefined);
    }
  }

  return (
    <section className="grid gap-6" aria-labelledby="tasks-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 id="tasks-heading" className="text-3xl font-semibold">
            Tasks
          </h1>
          <p className="text-muted-foreground">Your authorized tasks.</p>
        </div>
        {canCreate && <Link to={`/tasks/new${query}`}>Create task</Link>}
      </div>
      <TaskQueryControls
        query={queryState}
        user={snapshot.status === 'authenticated' ? snapshot.user : undefined}
        onChange={updateQuery}
      />
      {toast && <Toast message={toast} />}
      {state.status === 'loading' && <TaskTableSkeleton />}
      {state.status === 'error' && (
        <div className="grid gap-3" role="alert">
          <p>Unable to load tasks.</p>
          <Button
            type="button"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {state.status === 'ready' && state.tasks.length === 0 && (
        <div className="grid gap-3">
          <p>
            {hasCriteria ? 'No tasks match your criteria.' : 'No tasks yet.'}
          </p>
          {hasCriteria && <a href="/tasks">Clear criteria</a>}
        </div>
      )}
      {state.status === 'ready' && state.tasks.length > 0 && (
        <>
          <TaskTable
            tasks={state.tasks}
            totalItems={state.totalItems}
            user={
              snapshot.status === 'authenticated' ? snapshot.user : undefined
            }
            query={query}
            onDelete={requestDelete}
          />
          <TaskPagination
            page={queryState.page}
            totalPages={state.totalPages}
            onPageChange={(page) => updateQuery({ page })}
          />
        </>
      )}
      {location.pathname === '/tasks/new' && (
        <Sheet
          open
          title="Create task"
          ariaLabel="Create task panel"
          onOpenChange={(open) => {
            if (!open) navigate(`/tasks${query}`);
          }}
        >
          <TaskForm
            request={request}
            onClose={() => navigate(`/tasks${query}`)}
            onSaved={() =>
              navigate(`/tasks${query}`, { state: { toast: 'Task created.' } })
            }
          />
        </Sheet>
      )}
      {id && location.pathname.endsWith('/edit') && (
        <Sheet
          open
          title="Edit task"
          ariaLabel="Edit task panel"
          onOpenChange={(open) => {
            if (!open) navigate(`/tasks${query}`);
          }}
        >
          {editState.status === 'error' && editState.id === id && (
            <p role="alert">Unable to load task.</p>
          )}
          {editState.status !== 'error' || editState.id !== id ? (
            editState.status === 'ready' && editState.id === id ? (
              <TaskForm
                key={editState.task.id}
                request={request}
                task={editState.task}
                onClose={() => navigate(`/tasks${query}`)}
                onSaved={() =>
                  navigate(`/tasks${query}`, {
                    state: { toast: 'Task updated.' },
                  })
                }
              />
            ) : (
              <p role="status">Loading task</p>
            )
          ) : null}
        </Sheet>
      )}
      {deleteTarget && (
        <AlertDialog
          open
          title={`Delete task "${deleteTarget.title}" permanently?`}
          description="This action cannot be undone."
          onOpenChange={(open) => {
            if (!open && !deletingId) setDeleteTarget(undefined);
          }}
        >
          {deleteError && <p role="alert">{deleteError}</p>}
          <Button
            type="button"
            variant="destructive"
            onClick={() => void confirmDelete()}
            disabled={deletingId === deleteTarget.id}
          >
            {deletingId ? 'Deleting…' : 'Delete task permanently'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteTarget(undefined)}
            disabled={Boolean(deletingId)}
          >
            Cancel
          </Button>
        </AlertDialog>
      )}
    </section>
  );
}

function TaskTableSkeleton() {
  return (
    <div className="grid gap-3" role="status" aria-label="Loading tasks">
      <span>Loading tasks</span>
      <table aria-label="Tasks">
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Description</th>
            <th scope="col">Status</th>
            <th scope="col">Due date</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((row) => (
            <tr key={row}>
              <td colSpan={4}>
                <span
                  aria-hidden="true"
                  className="block h-8 rounded bg-muted"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskQueryControls({
  query,
  user,
  onChange,
}: {
  query: TaskQueryState;
  user?: { id: string; permissions: string[] };
  onChange: (changes: TaskQueryChanges) => void;
}) {
  const canFilterOwner = user?.permissions.includes('tasks:read:any');
  return (
    <div className="grid gap-3" aria-label="Task query controls">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1">
          Search tasks
          <input
            aria-label="Search tasks"
            value={query.search}
            onChange={(event) => onChange({ search: event.target.value })}
          />
        </label>
        <label className="grid gap-1">
          Status
          <select
            aria-label="Status"
            value={query.status}
            onChange={(event) =>
              onChange({
                status: event.target.value as TaskQueryState['status'],
              })
            }
          >
            <option value="">All statuses</option>
            {TASK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          Due date
          <input
            aria-label="Due date"
            type="date"
            value={query.dueDate}
            onChange={(event) => onChange({ dueDate: event.target.value })}
          />
        </label>
        <label className="grid gap-1">
          Sort by
          <select
            aria-label="Sort by"
            value={query.sort}
            onChange={(event) =>
              onChange({ sort: event.target.value as TaskQueryState['sort'] })
            }
          >
            {TASK_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {canFilterOwner && (
          <label className="grid gap-1">
            Owner ID
            <input
              aria-label="Owner ID"
              value={query.ownerId}
              onChange={(event) => onChange({ ownerId: event.target.value })}
            />
          </label>
        )}
        <label className="grid gap-1">
          Items per page
          <select
            aria-label="Items per page"
            value={query.limit}
            onChange={(event) =>
              onChange({ limit: Number(event.target.value) })
            }
          >
            {[10, 20, 50, 100].map((limit) => (
              <option key={limit} value={limit}>
                {limit}
              </option>
            ))}
          </select>
        </label>
      </div>
      {hasTaskCriteria(query) && (
        <button
          type="button"
          onClick={() =>
            onChange({
              search: '',
              status: '',
              ownerId: '',
              dueDate: '',
              page: 1,
            })
          }
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function TaskPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav aria-label="Task pagination" className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Previous page
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={totalPages === 0 || page >= totalPages}
      >
        Next page
      </button>
    </nav>
  );
}

function TaskTable({
  tasks,
  totalItems,
  user,
  query,
  onDelete,
}: {
  tasks: Task[];
  totalItems: number;
  user?: { id: string; permissions: string[] };
  query: string;
  onDelete: (task: Task) => void;
}) {
  return (
    <div className="grid gap-3">
      <table aria-label="Tasks">
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Description</th>
            <th scope="col">Status</th>
            <th scope="col">Due date</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>{task.title}</td>
              <td>{task.description ?? '—'}</td>
              <td>{task.status}</td>
              <td>{task.dueDate ?? '—'}</td>
              <td>
                <TaskRowActions
                  task={task}
                  user={user}
                  query={query}
                  onDelete={onDelete}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {totalItems} task{totalItems === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function TaskRowActions({
  task,
  user,
  query,
  onDelete,
}: {
  task: Task;
  user?: { id: string; permissions: string[] };
  query: string;
  onDelete: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  const canEdit = user && canShowTaskRowAction(user, 'update', task.ownerId);
  const canDelete = user && canShowTaskRowAction(user, 'delete', task.ownerId);
  if (!canEdit && !canDelete) return null;

  return (
    <div className="relative inline-flex">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`More actions for ${task.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal aria-hidden="true" />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${task.title}`}
          className="absolute right-0 top-full z-10 grid min-w-36 gap-1 rounded-md border bg-background p-1 shadow-md"
        >
          {canEdit && (
            <Link
              role="menuitem"
              className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              to={`/tasks/${task.id}/edit${query}`}
            >
              Edit task
            </Link>
          )}
          {canDelete && (
            <Button
              role="menuitem"
              type="button"
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                onDelete(task);
              }}
            >
              Delete task
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function hasTaskCriteria(query: TaskQueryState): boolean {
  return Boolean(
    query.search || query.status || query.ownerId || query.dueDate,
  );
}
