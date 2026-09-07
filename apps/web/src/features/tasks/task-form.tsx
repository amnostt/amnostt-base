import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { ApiError } from '../../core/http/api-client'
import { createTask } from './task-repository'
import type { TaskStatus } from './task-models'

type Requester = <T>(path: string, init?: RequestInit) => Promise<T>
type FormField = 'title' | 'description' | 'dueDate'
type FormErrors = Partial<Record<FormField, string>>

export interface TaskFormProps {
  request: Requester
  onClose: () => void
  onSaved: () => void
}

const initialValues = {
  title: '',
  description: '',
  status: 'pending' as TaskStatus,
  dueDate: '',
}

export function TaskForm({ request, onClose, onSaved }: TaskFormProps) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [generalError, setGeneralError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const dirty = values.title !== '' || values.description !== '' || values.dueDate !== '' || values.status !== 'pending'

  function updateValue(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setGeneralError(undefined)
  }

  function validate(): FormErrors {
    const nextErrors: FormErrors = {}
    const title = values.title.trim()
    if (!title) nextErrors.title = 'Title is required.'
    else if (title.length > 120) nextErrors.title = 'Title must be 120 characters or fewer.'
    if (values.description.length > 2000) nextErrors.description = 'Description must be 2000 characters or fewer.'
    if (values.dueDate && !isValidCalendarDate(values.dueDate)) nextErrors.dueDate = 'Due date must be a valid calendar date.'
    return nextErrors
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate()
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setSaving(true)
    setGeneralError(undefined)
    try {
      await createTask(request, {
        title: values.title.trim(),
        status: values.status,
        ...(values.description ? { description: values.description } : {}),
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
      })
      onSaved()
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        setErrors(Object.fromEntries(error.details.map((detail) => [detail.field, `Invalid ${detail.field}.`])) as FormErrors)
      }
      setGeneralError(error instanceof Error ? error.message : 'Unable to create task.')
    } finally {
      setSaving(false)
    }
  }

  function requestClose() {
    if (dirty) setConfirmClose(true)
    else onClose()
  }

  return (
    <>
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-2">
          <Label htmlFor="task-title">Title</Label>
          <Input id="task-title" value={values.title} onChange={(event) => updateValue('title', event.target.value)} aria-invalid={Boolean(errors.title)} />
          {errors.title && <p role="alert">{errors.title}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="task-description">Description</Label>
          <textarea id="task-description" value={values.description} onChange={(event) => updateValue('description', event.target.value)} aria-invalid={Boolean(errors.description)} />
          {errors.description && <p role="alert">{errors.description}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="task-status">Status</Label>
          <select id="task-status" value={values.status} onChange={(event) => updateValue('status', event.target.value)}>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="task-due-date">Due date</Label>
          <Input id="task-due-date" type="date" value={values.dueDate} onChange={(event) => updateValue('dueDate', event.target.value)} aria-invalid={Boolean(errors.dueDate)} />
          {errors.dueDate && <p role="alert">{errors.dueDate}</p>}
        </div>
        {generalError && <p role="alert">{generalError}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create task'}</Button>
          <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>Close</Button>
        </div>
      </form>
      <AlertDialog open={confirmClose} title="Discard unsaved changes?" description="Your changes will be lost.">
        <Button type="button" variant="destructive" onClick={onClose}>Discard changes</Button>
        <Button type="button" variant="outline" onClick={() => setConfirmClose(false)}>Keep editing</Button>
      </AlertDialog>
    </>
  )
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
}
