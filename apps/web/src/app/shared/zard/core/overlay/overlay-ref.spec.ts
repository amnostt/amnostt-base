import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { EventEmitter, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ZardOverlayRefBase, type ZardOverlayRefOptions } from './overlay-ref';

interface Value {
  label: string;
}

interface Footer {
  ok: Subject<void>;
  cancel: Subject<void>;
}

class ComponentRef extends ZardOverlayRefBase<Value, object> {
  readonly leave = vi.fn();

  constructor(overlay: OverlayRef, options: ZardOverlayRefOptions<Value>, footer: Footer) {
    super(overlay, options, TestBed.inject(PLATFORM_ID));
    this.attach(footer);
  }

  protected readonly defaultDuration = 0;

  protected playLeaveAnimation() {
    this.leave();
  }
}

class DataRef extends ComponentRef {
  constructor(
    overlay: OverlayRef,
    options: ZardOverlayRefOptions<Value>,
    footer: Footer,
    private readonly data: Value,
  ) {
    super(overlay, options, footer);
  }

  protected override callbackArgument(): Value {
    return this.data;
  }

  protected override forwardsCallbackResult(): boolean {
    return false;
  }
}

describe.each(['component', 'data'] as const)('Overlay callback argument: %s', (kind) => {
  const actions = ['ok', 'cancel'] as const;
  let refs: ComponentRef[];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    vi.useFakeTimers();
    refs = [];
  });

  afterEach(() => {
    for (const ref of refs) ref.close();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  function open(options: ZardOverlayRefOptions<Value>) {
    const overlay = TestBed.inject(Overlay).create();
    const footer = { ok: new Subject<void>(), cancel: new Subject<void>() };
    const component = { label: 'Current draft' };
    const data = { label: 'Confirmation data' };
    const ref =
      kind === 'component'
        ? new ComponentRef(overlay, options, footer)
        : new DataRef(overlay, options, footer, data);
    refs.push(ref);
    ref.setComponentInstance(component);
    return { ref, footer, component, data, expected: kind === 'component' ? component : data };
  }

  it.each(actions)(
    'routes the %s function through the argument hook and preserves result handling',
    (action) => {
      const result = { accepted: true };
      const callback = vi.fn<(value: Value) => object>().mockReturnValue(result);
      const { ref, footer, component, expected } = open(
        action === 'ok' ? { zOnOk: callback } : { zOnCancel: callback },
      );

      footer[action].next();

      expect(callback).toHaveBeenCalledExactlyOnceWith(expected);
      expect(callback.mock.calls[0][0]).toBe(expected);
      expect(ref.componentInstance()).toBe(component);
      expect(component.label).toBe('Current draft');
      expect(ref.isClosing()).toBe(true);
      expect(ref.result()).toBe(kind === 'component' ? result : undefined);
    },
  );

  it.each(actions)(
    'routes the %s EventEmitter through the hook without automatically closing',
    (action) => {
      const emitter = new EventEmitter<Value>();
      const listener = vi.fn();
      emitter.subscribe(listener);
      const { ref, footer, component, expected } = open(
        action === 'ok' ? { zOnOk: emitter } : { zOnCancel: emitter },
      );

      footer[action].next();

      expect(listener).toHaveBeenCalledExactlyOnceWith(expected);
      expect(listener.mock.calls[0][0]).toBe(expected);
      expect(ref.componentInstance()).toBe(component);
      expect(ref.isClosing()).toBe(false);
      expect(ref.result()).toBeUndefined();
    },
  );

  it.each(actions)('preserves the draft and data when the %s function returns false', (action) => {
    const callback = vi.fn<(value: Value) => false>().mockReturnValue(false);
    const { ref, footer, component, data, expected } = open(
      action === 'ok' ? { zOnOk: callback } : { zOnCancel: callback },
    );

    footer[action].next();

    expect(callback).toHaveBeenCalledExactlyOnceWith(expected);
    expect(callback.mock.calls[0][0]).toBe(expected);
    expect(ref.componentInstance()).toBe(component);
    expect(component).toEqual({ label: 'Current draft' });
    expect(data).toEqual({ label: 'Confirmation data' });
    expect(ref.isClosing()).toBe(false);
    expect(ref.result()).toBeUndefined();
    expect(ref.leave).not.toHaveBeenCalled();
  });
});
