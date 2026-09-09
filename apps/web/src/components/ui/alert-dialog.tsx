import { useId } from 'react';
import type { ReactNode } from 'react';
import { trapModalFocus, useModalFocus } from './modal';

interface AlertDialogProps {
  open: boolean;
  title: string;
  description: string;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
}

export function AlertDialog({
  open,
  title,
  description,
  children,
  onOpenChange,
}: AlertDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useModalFocus(open, () => onOpenChange(false));
  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onKeyDown={(event) => trapModalFocus(event, dialogRef.current)}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div>{children}</div>
    </div>
  );
}
