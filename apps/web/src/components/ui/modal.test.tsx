import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertDialog } from './alert-dialog';
import { Sheet } from './sheet';

afterEach(cleanup);

describe('modal primitives', () => {
  it('places focus, traps Tab, closes on Escape, and restores the Sheet trigger', async () => {
    const onOpenChange = vi.fn();
    const view = render(<button type="button">Open sheet</button>);
    const trigger = screen.getByRole('button', { name: 'Open sheet' });
    trigger.focus();
    view.rerender(
      <>
        <button type="button">Open sheet</button>
        <Sheet
          open
          title="Edit task"
          ariaLabel="Edit task panel"
          onOpenChange={onOpenChange}
        >
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </Sheet>
      </>,
    );
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });
    expect(first).toHaveFocus();
    await userEvent.setup().tab({ shift: true });
    expect(last).toHaveFocus();
    await userEvent.setup().keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    view.rerender(<button type="button">Open sheet</button>);
    expect(screen.getByRole('button', { name: 'Open sheet' })).toHaveFocus();
  });

  it('provides alert-dialog semantics and Escape dismissal', async () => {
    const onOpenChange = vi.fn();
    render(
      <AlertDialog
        open
        title="Delete task"
        description="This cannot be undone."
        onOpenChange={onOpenChange}
      >
        <button type="button">Delete</button>
      </AlertDialog>,
    );

    expect(
      screen.getByRole('dialog', { name: 'Delete task' }),
    ).toHaveAccessibleDescription('This cannot be undone.');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await userEvent.setup().keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('dismisses only the topmost modal when dialogs are nested', async () => {
    const onSheetChange = vi.fn();
    const onAlertChange = vi.fn();
    render(
      <Sheet
        open
        title="Edit task"
        ariaLabel="Edit task panel"
        onOpenChange={onSheetChange}
      >
        <AlertDialog
          open
          title="Discard changes?"
          description="Your changes will be lost."
          onOpenChange={onAlertChange}
        >
          <button type="button">Discard</button>
        </AlertDialog>
      </Sheet>,
    );

    await userEvent.setup().keyboard('{Escape}');
    expect(onAlertChange).toHaveBeenCalledWith(false);
    expect(onSheetChange).not.toHaveBeenCalled();
  });
});
