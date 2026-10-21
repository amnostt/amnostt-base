import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';

import { provideZard } from '@/shared/zard/core/provider/providezard';
import type { TaskListResponse } from '../../domain/task-model';
import { TasksApi } from '../../infrastructure/tasks-api';
import { TaskList } from './task-list';

function deferred() {
  let resolve!: (result: TaskListResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<TaskListResponse>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function response(title: string, page: number, totalPages: number): TaskListResponse {
  return {
    data: [
      {
        id: title,
        ownerId: 'owner',
        title,
        description: null,
        status: 'pending',
        dueDate: null,
        createdAt: '2026-10-19T00:00:00Z',
        updatedAt: '2026-10-19T00:00:00Z',
      },
    ],
    meta: { page, limit: 20, totalItems: totalPages * 20, totalPages },
  };
}

describe('independent Tasks ordering checks', () => {
  const api = { list: vi.fn() };

  beforeEach(() => {
    api.list.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideZard(),
        provideRouter([{ path: 'tasks', component: TaskList }]),
        { provide: TasksApi, useValue: api },
      ],
    });
  });

  it('ignores an obsolete success and its pagination total after a newer page succeeds', async () => {
    const old = deferred();
    const latest = deferred();
    api.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tasks?page=2', TaskList);
    await harness.navigateByUrl('/tasks?page=3', TaskList);
    latest.resolve(response('Current row', 3, 3));
    await harness.fixture.whenStable();
    old.resolve(response('Obsolete row', 2, 99));
    await harness.fixture.whenStable();

    expect(harness.routeNativeElement!.textContent).toContain('Current row');
    expect(harness.routeNativeElement!.textContent).not.toContain('Obsolete row');
    expect(TestBed.inject(Router).url).toBe('/tasks?page=3');
    expect(
      harness
        .routeNativeElement!.querySelector('z-pagination-next button')
        ?.hasAttribute('disabled'),
    ).toBe(true);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('retains last accepted metadata but disables navigation on current failure despite old completion', async () => {
    const first = deferred();
    const failed = deferred();
    api.list
      .mockResolvedValueOnce(response('Initial', 1, 4))
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(failed.promise);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tasks', TaskList);
    await harness.navigateByUrl('/tasks?page=2', TaskList);
    await harness.navigateByUrl('/tasks?page=3', TaskList);
    failed.reject(new Error('current failure'));
    await harness.fixture.whenStable();
    first.resolve(response('Stale', 2, 99));
    await harness.fixture.whenStable();

    expect(harness.routeNativeElement!.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudieron cargar',
    );
    expect(harness.routeNativeElement!.textContent).not.toContain('Stale');
    expect(
      harness
        .routeNativeElement!.querySelector('z-pagination-next button')
        ?.hasAttribute('disabled'),
    ).toBe(true);
    expect(TestBed.inject(Router).url).toBe('/tasks?page=3');
    expect(api.list).toHaveBeenCalledTimes(3);
  });

  it('cancels a pending search draft when an external route replaces its criteria', async () => {
    api.list.mockResolvedValue(response('Initial', 1, 4));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tasks?status=pending', TaskList);
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>('#task-search')!;
    input.value = 'obsolete draft';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('#task-search')?.value).toBe(
      'obsolete draft',
    );

    await harness.navigateByUrl('/tasks?status=completed', TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/tasks?status=completed');
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls[1]?.[0]).toMatchObject({ status: 'completed', search: '' });
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('#task-search')?.value).toBe(
      '',
    );
  });
});
