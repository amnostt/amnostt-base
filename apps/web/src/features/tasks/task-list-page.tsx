import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { useSession } from '../auth/components/session-provider'
import { TaskForm } from './task-form'
import { canShowTaskRowAction } from './task-permissions'
import { createTaskRepository } from './task-repository'
import type { Task } from './task-models'

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tasks: Task[]; totalItems: number }

type EditState =
  | { status: 'idle' }
  | { status: 'error'; id: string }
  | { status: 'ready'; id: string; task: Task }

export function TaskListPage() {
  const { snapshot, request, requestResponse } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const { id } = useParams()
  const userId = snapshot.status === 'authenticated' ? snapshot.user.id : undefined
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [editState, setEditState] = useState<EditState>({ status: 'idle' })
  const query = location.search
  const notice = (location.state as { notice?: string } | null)?.notice
  const canCreate = snapshot.status === 'authenticated' && (
    snapshot.user.permissions.includes('tasks:create:own') || snapshot.user.permissions.includes('tasks:create:any')
  )

  useEffect(() => {
    if (!userId) return
    let active = true
    void createTaskRepository(requestResponse).list(query)
      .then((response) => {
        if (active) setState({ status: 'ready', tasks: response.data, totalItems: response.meta?.totalItems ?? response.data.length })
      })
      .catch(() => {
        if (active) setState({ status: 'error' })
      })
    return () => { active = false }
  }, [attempt, location.pathname, query, requestResponse, userId])

  useEffect(() => {
    if (!id) return
    let active = true
    void request<Task>(`/tasks/${id}`)
      .then((task) => {
        if (active) setEditState({ status: 'ready', id, task })
      })
      .catch(() => {
        if (active) setEditState({ status: 'error', id })
      })
    return () => { active = false }
  }, [id, request])

  const hasCriteria = hasTaskCriteria(query)
  return <section className="grid gap-6" aria-labelledby="tasks-heading">
    <div className="flex items-start justify-between gap-4"><div><h1 id="tasks-heading" className="text-3xl font-semibold">Tasks</h1><p className="text-muted-foreground">Your authorized tasks.</p></div>{canCreate && <Link to={`/tasks/new${query}`}>Create task</Link>}</div>
    {notice && <p role="status">{notice}</p>}
    {state.status === 'loading' && <TaskTableSkeleton />}
    {state.status === 'error' && <div className="grid gap-3" role="alert"><p>Unable to load tasks.</p><Button type="button" onClick={() => { setState({ status: 'loading' }); setAttempt((value) => value + 1) }}>Retry</Button></div>}
    {state.status === 'ready' && state.tasks.length === 0 && <div className="grid gap-3"><p>{hasCriteria ? 'No tasks match your criteria.' : 'No tasks yet.'}</p>{hasCriteria && <a href="/tasks">Clear criteria</a>}</div>}
    {state.status === 'ready' && state.tasks.length > 0 && <TaskTable tasks={state.tasks} totalItems={state.totalItems} user={snapshot.status === 'authenticated' ? snapshot.user : undefined} query={query} />}
    {location.pathname === '/tasks/new' && <aside aria-label="Create task panel" className="grid gap-4"><h2 className="text-2xl font-semibold">Create task</h2><TaskForm request={request} onClose={() => navigate(`/tasks${query}`)} onSaved={() => navigate(`/tasks${query}`, { state: { notice: 'Task created.' } })} /></aside>}
    {id && location.pathname.endsWith('/edit') && <aside aria-label="Edit task panel" className="grid gap-4"><h2 className="text-2xl font-semibold">Edit task</h2>{editState.status === 'error' && editState.id === id && <p role="alert">Unable to load task.</p>}{editState.status !== 'error' || editState.id !== id ? editState.status === 'ready' && editState.id === id ? <TaskForm key={editState.task.id} request={request} task={editState.task} onClose={() => navigate(`/tasks${query}`)} onSaved={() => navigate(`/tasks${query}`, { state: { notice: 'Task updated.' } })} /> : <p role="status">Loading task</p> : null}</aside>}
  </section>
}

function TaskTableSkeleton() {
  return <div className="grid gap-3" role="status" aria-label="Loading tasks"><span>Loading tasks</span><table aria-label="Tasks"><thead><tr><th scope="col">Title</th><th scope="col">Description</th><th scope="col">Status</th><th scope="col">Due date</th></tr></thead><tbody>{[1, 2, 3].map((row) => <tr key={row}><td colSpan={4}><span aria-hidden="true" className="block h-8 rounded bg-muted" /></td></tr>)}</tbody></table></div>
}

function TaskTable({ tasks, totalItems, user, query }: { tasks: Task[]; totalItems: number; user?: { id: string; permissions: string[] }; query: string }) {
  return <div className="grid gap-3"><table aria-label="Tasks"><thead><tr><th scope="col">Title</th><th scope="col">Description</th><th scope="col">Status</th><th scope="col">Due date</th><th scope="col">Actions</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td>{task.title}</td><td>{task.description ?? '—'}</td><td>{task.status}</td><td>{task.dueDate ?? '—'}</td><td>{user && canShowTaskRowAction(user, 'update', task.ownerId) && <Link to={`/tasks/${task.id}/edit${query}`}>Edit task</Link>}</td></tr>)}</tbody></table><p>{totalItems} task{totalItems === 1 ? '' : 's'}</p></div>
}

function hasTaskCriteria(query: string): boolean {
  const params = new URLSearchParams(query)
  return ['search', 'status', 'ownerId', 'dueDate'].some((name) => Boolean(params.get(name)?.trim()))
}
