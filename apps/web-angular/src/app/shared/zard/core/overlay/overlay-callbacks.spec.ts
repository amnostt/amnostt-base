import { ChangeDetectionStrategy, Component, EventEmitter } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ZardAlertDialogService } from '../../components/alert-dialog/alert-dialog.service';
import { ZardSheetService } from '../../components/sheet/sheet.service';
import { provideZard } from '../provider/providezard';

@Component({
  selector: 'app-overlay-test-content',
  template: '<input aria-label="Callback draft" [value]="value" (input)="edit($event)">',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class OverlayTestContent {
  value = 'Current form value';

  edit(event: Event) {
    if (event.target instanceof HTMLInputElement) this.value = event.target.value;
  }
}

const actions = ['ok', 'cancel'] as const;

describe('Zard service overlay callback compatibility', () => {
  let fixture: ComponentFixture<OverlayTestContent>;
  let refs: { close(): void }[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZard()] });
    fixture = TestBed.createComponent(OverlayTestContent);
    fixture.detectChanges();
    refs = [];
  });

  afterEach(async () => {
    for (const ref of refs) ref.close();
    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();
      expect(document.body.querySelector('[data-slot="sheet-content"]')).toBeNull();
    });
  });

  async function clickFooter(kind: 'alert' | 'sheet', action: (typeof actions)[number]) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const testId = kind === 'alert' ? `z-alert-${action}-button` : `z-${action}-button`;
    const button = document.body.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    expect(button).not.toBeNull();
    button!.click();
    fixture.detectChanges();
  }

  async function editSheetDraft() {
    fixture.detectChanges();
    await fixture.whenStable();
    const input = document.body.querySelector<HTMLInputElement>(
      '[data-slot="sheet-content"] input[aria-label="Callback draft"]',
    );
    expect(input).not.toBeNull();
    input!.value = 'Draft unchanged';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    return input!;
  }

  it.each(actions)(
    'passes AlertDialog zData to the %s function without forwarding its result',
    async (action) => {
      const data = { taskId: 'draft-task' };
      const callback = vi.fn<(value: typeof data) => object>().mockReturnValue({ ignored: true });
      const ref = TestBed.inject(ZardAlertDialogService).create({
        zTitle: 'Discard draft?',
        zData: data,
        zDuration: 0,
        ...(action === 'ok' ? { zOnOk: callback } : { zOnCancel: callback }),
      });
      refs.push(ref);

      await clickFooter('alert', action);

      expect(callback).toHaveBeenCalledExactlyOnceWith(data);
      expect(callback.mock.calls[0][0]).toBe(data);
      expect(ref.isClosing()).toBe(true);
      expect(ref.result()).toBeUndefined();
    },
  );

  it.each(actions)(
    'passes AlertDialog zData to the %s EventEmitter without closing automatically',
    async (action) => {
      const data = { taskId: 'draft-task' };
      const emitter = new EventEmitter<typeof data>();
      const listener = vi.fn();
      emitter.subscribe(listener);
      const ref = TestBed.inject(ZardAlertDialogService).create({
        zTitle: 'Discard draft?',
        zData: data,
        zDuration: 0,
        ...(action === 'ok' ? { zOnOk: emitter } : { zOnCancel: emitter }),
      });
      refs.push(ref);

      await clickFooter('alert', action);

      expect(listener).toHaveBeenCalledExactlyOnceWith(data);
      expect(listener.mock.calls[0][0]).toBe(data);
      expect(ref.isClosing()).toBe(false);
      expect(ref.result()).toBeUndefined();
    },
  );

  it.each(actions)(
    'respects a false AlertDialog %s callback and permits a later confirmation',
    async (action) => {
      const data = { taskId: 'draft-task' };
      const callback = vi
        .fn<(_data: typeof data) => false | object>()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce({ ignored: true });
      const ref = TestBed.inject(ZardAlertDialogService).create({
        zTitle: 'Discard draft?',
        zData: data,
        zDuration: 0,
        ...(action === 'ok' ? { zOnOk: callback } : { zOnCancel: callback }),
      });
      refs.push(ref);

      await clickFooter('alert', action);
      expect(callback).toHaveBeenCalledExactlyOnceWith(data);
      expect(ref.isClosing()).toBe(false);
      expect(ref.result()).toBeUndefined();
      expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull();

      await clickFooter('alert', action);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith(data);
      expect(ref.isClosing()).toBe(true);
      expect(ref.result()).toBeUndefined();
    },
  );

  it.each(actions)(
    'preserves the Sheet %s function component argument and result',
    async (action) => {
      const result = { accepted: true };
      const callback = vi.fn<(instance: OverlayTestContent) => object>().mockReturnValue(result);
      const ref = TestBed.inject(ZardSheetService).create({
        zContent: OverlayTestContent,
        zDuration: 0,
        ...(action === 'ok' ? { zOnOk: callback } : { zOnCancel: callback }),
      });
      refs.push(ref);
      await editSheetDraft();
      const content = ref.componentInstance();
      expect(content).toBeInstanceOf(OverlayTestContent);
      expect(content?.value).toBe('Draft unchanged');

      await clickFooter('sheet', action);

      expect(callback).toHaveBeenCalledExactlyOnceWith(content);
      expect(callback.mock.calls[0][0]).toBe(content);
      expect(ref.componentInstance()).toBe(content);
      expect(content?.value).toBe('Draft unchanged');
      expect(ref.isClosing()).toBe(true);
      expect(ref.result()).toBe(result);
    },
  );

  it.each(actions)(
    'preserves the Sheet %s EventEmitter component argument without closing',
    async (action) => {
      const emitter = new EventEmitter<OverlayTestContent>();
      const listener = vi.fn();
      emitter.subscribe(listener);
      const ref = TestBed.inject(ZardSheetService).create({
        zContent: OverlayTestContent,
        zDuration: 0,
        ...(action === 'ok' ? { zOnOk: emitter } : { zOnCancel: emitter }),
      });
      refs.push(ref);
      const input = await editSheetDraft();
      const content = ref.componentInstance();
      expect(content).toBeInstanceOf(OverlayTestContent);
      expect(content?.value).toBe('Draft unchanged');

      await clickFooter('sheet', action);

      expect(listener).toHaveBeenCalledExactlyOnceWith(content);
      expect(listener.mock.calls[0][0]).toBe(content);
      expect(ref.isClosing()).toBe(false);
      expect(ref.result()).toBeUndefined();
      expect(ref.componentInstance()).toBe(content);
      expect(content?.value).toBe('Draft unchanged');
      expect(document.body.querySelector('[data-slot="sheet-content"] input')).toBe(input);
      expect(input.value).toBe('Draft unchanged');
    },
  );

  it.each(actions)(
    'preserves a false Sheet %s callback and the current content instance',
    async (action) => {
      const callback = vi.fn<(instance: OverlayTestContent) => false>().mockReturnValue(false);
      const ref = TestBed.inject(ZardSheetService).create({
        zContent: OverlayTestContent,
        zDuration: 0,
        ...(action === 'ok' ? { zOnOk: callback } : { zOnCancel: callback }),
      });
      refs.push(ref);
      const input = await editSheetDraft();
      const content = ref.componentInstance();
      expect(content).toBeInstanceOf(OverlayTestContent);
      expect(content?.value).toBe('Draft unchanged');

      await clickFooter('sheet', action);

      expect(callback).toHaveBeenCalledExactlyOnceWith(content);
      expect(ref.componentInstance()).toBe(content);
      expect(ref.isClosing()).toBe(false);
      expect(ref.result()).toBeUndefined();
      expect(document.body.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
      expect(content?.value).toBe('Draft unchanged');
      expect(document.body.querySelector('[data-slot="sheet-content"] input')).toBe(input);
      expect(input.value).toBe('Draft unchanged');
    },
  );
});
