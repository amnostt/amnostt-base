import type { ReactNode } from 'react'

interface AlertDialogProps {
  open: boolean
  title: string
  description: string
  children: ReactNode
}

export function AlertDialog({ open, title, description, children }: AlertDialogProps) {
  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
      <h2 id="alert-dialog-title">{title}</h2>
      <p id="alert-dialog-description">{description}</p>
      <div>{children}</div>
    </div>
  )
}
