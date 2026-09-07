interface ToastProps {
  message: string
}

export function Toast({ message }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="toast"
      className="fixed bottom-4 right-4 z-50 rounded-md border bg-background px-4 py-3 shadow-lg"
    >
      {message}
    </div>
  )
}
