import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskForm } from './task-form'

type Requester = <T>(path: string, init?: RequestInit) => Promise<T>

function renderForm(request: Requester = vi.fn().mockResolvedValue({ id: 'task-1' })) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(<TaskForm request={request} onClose={onClose} onSaved={onSaved} />)
  return { onClose, onSaved }
}

afterEach(cleanup)

describe('TaskForm', () => {
  it('shows field validation and does not submit an empty title', async () => {
    const request = vi.fn()
    renderForm(request)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Create task' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Title is required.')
    expect(request).not.toHaveBeenCalled()
  })

  it('submits a trimmed title with the pending status and a past date', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'task-1' })
    const { onSaved } = renderForm(request)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Title'), '  Past task  ')
    await user.type(screen.getByLabelText('Due date'), '2020-01-02')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(request).toHaveBeenCalledWith('/tasks', {
      body: JSON.stringify({ title: 'Past task', status: 'pending', dueDate: '2020-01-02' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
  })

  it('requires confirmation before closing a dirty form', async () => {
    const { onClose } = renderForm()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Title'), 'Draft task')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard unsaved changes?')
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
