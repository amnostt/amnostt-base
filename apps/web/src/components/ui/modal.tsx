import { useEffect, useRef } from 'react';
import type { KeyboardEvent, RefObject } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const modalStack: HTMLDivElement[] = [];

export function useModalFocus(
  open: boolean,
  onClose: () => void,
): RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialogElement = dialogRef.current;
    if (!dialogElement) return;
    const dialog: HTMLDivElement = dialogElement;

    modalStack.push(dialog);
    const firstFocusable = dialog.querySelector<HTMLElement>(focusableSelector);
    (firstFocusable ?? dialog).focus();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target;
      const nestedModalOwnsEvent =
        target instanceof Node &&
        modalStack.some(
          (candidate) =>
            candidate !== dialog &&
            dialog.contains(candidate) &&
            candidate.contains(target),
        );
      if (
        event.key === 'Escape' &&
        !nestedModalOwnsEvent &&
        (modalStack.at(-1) === dialog || dialog.contains(target as Node))
      ) {
        event.preventDefault();
        onCloseRef.current();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const index = modalStack.indexOf(dialog);
      if (index >= 0) modalStack.splice(index, 1);
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  return dialogRef;
}

export function trapModalFocus(
  event: KeyboardEvent<HTMLDivElement>,
  dialog: HTMLDivElement | null,
) {
  if (event.key !== 'Tab' || !dialog) return;

  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(focusableSelector),
  );
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
