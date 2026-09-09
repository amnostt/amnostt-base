import type { ReactNode } from 'react';
import { trapModalFocus, useModalFocus } from './modal';

interface SheetProps {
  open: boolean;
  title: string;
  ariaLabel: string;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
}

export function Sheet({
  open,
  title,
  ariaLabel,
  children,
  onOpenChange,
}: SheetProps) {
  const dialogRef = useModalFocus(open, () => onOpenChange(false));
  if (!open) return null;

  return (
    <>
      <div
        data-slot="sheet-overlay"
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/50"
        onMouseDown={() => onOpenChange(false)}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={(event) => trapModalFocus(event, dialogRef.current)}
        data-slot="sheet-content"
        data-side="right"
        className="fixed inset-y-0 right-0 z-50 grid w-full max-w-lg content-start gap-4 overflow-y-auto border-l bg-background p-6 shadow-lg"
      >
        <h2 className="text-2xl font-semibold">{title}</h2>
        {children}
      </div>
    </>
  );
}
