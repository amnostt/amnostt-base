import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { SessionStore } from '@/features/auth/application/session-store';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import type { TaskListResponse } from '../../domain/task-model';
import { parseTaskQuery, type TaskQueryState } from '../../domain/task-query';
import { TasksApi } from '../../infrastructure/tasks-api';
import { TaskList } from './task-list';

function result(title: string): TaskListResponse {
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
    meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
  };
}

function pagedResult(page = 1, limit = 20, totalItems = 65): TaskListResponse {
  return {
    ...result(`Page ${page}`),
    data: totalItems === 0 ? [] : result(`Page ${page}`).data,
    meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
  };
}

function deferred() {
  let resolve!: (value: TaskListResponse) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<TaskListResponse>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const sortCases = [
  { sort: '-createdAt', label: 'Más recientes' },
  { sort: 'createdAt', label: 'Más antiguas' },
  { sort: '-updatedAt', label: 'Actualización más reciente' },
  { sort: 'updatedAt', label: 'Actualización más antigua' },
  { sort: 'dueDate', label: 'Vencimiento más próximo' },
  { sort: '-dueDate', label: 'Vencimiento más lejano' },
  { sort: 'title', label: 'Título: A–Z' },
  { sort: '-title', label: 'Título: Z–A' },
];

describe('TaskList real-router query ordering', () => {
  const api = { list: vi.fn<(query?: TaskQueryState) => Promise<TaskListResponse>>() };

  beforeEach(() => {
    api.list.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideZard(),
        provideRouter([{ path: 'tasks', component: TaskList }]),
        { provide: SessionStore, useValue: { state: () => ({ status: 'unauthenticated' }) } },
        { provide: TasksApi, useValue: api },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function statusTrigger(harness: RouterTestingHarness): HTMLButtonElement {
    const labels = ['Todos los estados', 'Pendiente', 'En progreso', 'Completada'];
    const trigger = Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>(
        'z-select button[role="combobox"]',
      ),
    ).find((button) => labels.includes(button.getAttribute('aria-label') ?? ''));
    expect(trigger).toBeDefined();
    return trigger!;
  }

  function columnHeader(harness: RouterTestingHarness, field: 'title' | 'dueDate') {
    const label = field === 'title' ? 'Título' : 'Vencimiento';
    const header = Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLTableCellElement>('thead th'),
    ).find((cell) => cell.querySelector('button')?.textContent?.includes(label));
    expect(header).toBeDefined();
    expect(header!.getAttribute('scope')).toBe('col');
    const button = header!.querySelector('button');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    return header!;
  }

  function expectColumnSort(harness: RouterTestingHarness, sort: string) {
    for (const field of ['title', 'dueDate'] as const) {
      const expected = sort === field ? 'ascending' : sort === `-${field}` ? 'descending' : null;
      expect(columnHeader(harness, field).getAttribute('aria-sort')).toBe(expected);
    }
    const activeColumns = harness.routeNativeElement!.querySelectorAll('thead th[aria-sort]');
    expect(activeColumns).toHaveLength(/^-?(title|dueDate)$/.test(sort) ? 1 : 0);
  }

  function sortMenuTrigger(harness: RouterTestingHarness) {
    const trigger = harness.routeNativeElement!.querySelector<HTMLButtonElement>(
      'button[aria-label="Más opciones de ordenación"]',
    );
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute('aria-haspopup')).toBe('menu');
    return trigger!;
  }

  function pageSizeTrigger(harness: RouterTestingHarness) {
    const group = harness.routeNativeElement!.querySelector(
      '[role="group"][aria-label="Tareas por página"]',
    );
    expect(group).not.toBeNull();
    const trigger = group!.querySelector<HTMLButtonElement>('button[role="combobox"]');
    expect(trigger).not.toBeNull();
    return trigger!;
  }

  function pagination(harness: RouterTestingHarness) {
    const element = harness.routeNativeElement!.querySelector<HTMLElement>(
      '[data-slot="pagination"][role="group"][aria-label="Paginación de tareas"]',
    );
    expect(element).not.toBeNull();
    return element!;
  }

  function numberedPages(harness: RouterTestingHarness) {
    return Array.from(pagination(harness).querySelectorAll<HTMLButtonElement>('button')).filter(
      (button) => !button.closest('z-pagination-previous, z-pagination-next'),
    );
  }

  function pageNavigation(harness: RouterTestingHarness, direction: 'previous' | 'next') {
    const button = pagination(harness).querySelector<HTMLButtonElement>(
      `z-pagination-${direction} button`,
    );
    expect(button).not.toBeNull();
    return button!;
  }

  function dueDateTrigger(harness: RouterTestingHarness) {
    const picker = harness.routeNativeElement!.querySelector('[data-slot="date-picker"]');
    expect(picker).not.toBeNull();
    const trigger = picker!.querySelector<HTMLButtonElement>('button');
    expect(trigger).not.toBeNull();
    expect(trigger!.id).not.toBe('');
    const label = Array.from(harness.routeNativeElement!.querySelectorAll('label')).find(
      (item) => item.htmlFor === trigger!.id,
    );
    expect(label?.textContent).toContain('Vencimiento');
    return trigger!;
  }

  function clearDueDate(harness: RouterTestingHarness) {
    const button = Array.from(harness.routeNativeElement!.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Limpiar vencimiento',
    );
    expect(button).toBeDefined();
    return button!;
  }

  function dateLabel(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(
      new Date(year, month - 1, day, 12),
    );
  }

  async function selectDueDate(harness: RouterTestingHarness, value: string) {
    dueDateTrigger(harness).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    const expectedDay = date.toLocaleDateString('es');
    const monthName = new Intl.DateTimeFormat('es', { month: 'long' }).format(date);
    let button: HTMLButtonElement | undefined;
    await vi.waitFor(() => {
      button = Array.from(
        document.body.querySelectorAll<HTMLButtonElement>('button[data-day]'),
      ).find(
        (item) =>
          item.getAttribute('data-day') === expectedDay &&
          item.getAttribute('aria-label')?.toLowerCase().includes(monthName) &&
          item.getAttribute('aria-label')?.includes(String(year)),
      );
      expect(button).toBeDefined();
    });
    button!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    await vi.waitFor(() => expect(document.body.querySelector('z-calendar')).toBeNull());
  }

  function searchInput(harness: RouterTestingHarness): HTMLInputElement {
    const input = harness.routeNativeElement?.querySelector<HTMLInputElement>(
      'input[z-input][type="search"]',
    );
    expect(input).not.toBeNull();
    expect(input).toBeDefined();
    expect(input!.id).not.toBe('');
    const label = Array.from(harness.routeNativeElement!.querySelectorAll('label')).find(
      (item) => item.htmlFor === input!.id,
    );
    expect(label?.textContent).toContain('Buscar tareas');
    return input!;
  }

  function enterSearch(harness: RouterTestingHarness, input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    harness.detectChanges();
  }

  function fakeDebounceTimers() {
    // Control RxJS timers without trapping Angular's rendering scheduler.
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'Date'],
    });
  }

  for (const order of ['old-first', 'new-first'] as const) {
    it(`keeps the new route result when ${order} completes`, async () => {
      const older = deferred();
      const newer = deferred();
      api.list.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
      const harness = await RouterTestingHarness.create();

      await harness.navigateByUrl('/tasks?search=old', TaskList);
      await harness.navigateByUrl('/tasks?search=new', TaskList);

      expect(api.list).toHaveBeenCalledTimes(2);
      expect(api.list.mock.calls[0][0]).toMatchObject({ search: 'old' });
      expect(api.list.mock.calls[1][0]).toMatchObject({ search: 'new' });
      expect(harness.routeNativeElement?.textContent).toContain('Cargando');

      if (order === 'old-first') {
        older.resolve(result('Obsolete'));
        await Promise.resolve();
        harness.detectChanges();
        expect(harness.routeNativeElement?.textContent).not.toContain('Obsolete');
        newer.resolve(result('Current'));
      } else {
        newer.resolve(result('Current'));
        await Promise.resolve();
        harness.detectChanges();
        older.resolve(result('Obsolete'));
      }

      await Promise.resolve();
      harness.detectChanges();

      expect(harness.routeNativeElement?.textContent).toContain('Current');
      expect(harness.routeNativeElement?.textContent).not.toContain('Obsolete');
    });
  }

  it('keeps a current error over an obsolete success and deduplicates normalized URLs', async () => {
    const older = deferred();
    const newer = deferred();
    api.list.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/tasks?search=%20alpha%20', TaskList);
    await harness.navigateByUrl('/tasks?search=alpha', TaskList);
    expect(api.list).toHaveBeenCalledTimes(1);
    await harness.navigateByUrl('/tasks?search=beta', TaskList);

    newer.reject(new Error('Current request failed'));
    await Promise.resolve();
    harness.detectChanges();
    older.resolve(result('Obsolete'));
    await Promise.resolve();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Reintentar');
    expect(harness.routeNativeElement?.textContent).not.toContain('Obsolete');
  });

  it.each([
    { status: 'pending', label: 'Pendiente' },
    { status: 'in_progress', label: 'En progreso' },
    { status: 'completed', label: 'Completada' },
    { status: '', label: 'Todos los estados' },
  ])('updates the URL and reloads once when selecting $label', async ({ status, label }) => {
    api.list.mockResolvedValue(result('Filtered task'));
    const harness = await RouterTestingHarness.create();
    const initialStatus = status === 'completed' ? 'pending' : 'completed';
    const initialUrl =
      `/tasks?search=Plan%20%26%20review&status=${initialStatus}` +
      '&ownerId=11111111-1111-4111-8111-111111111111' +
      '&dueDate=2026-10-25&sort=title&page=3&limit=50';
    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();

    const initialQuery = parseTaskQuery(initialUrl.split('?')[1]);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenLastCalledWith(initialQuery);

    const trigger = statusTrigger(harness);
    expect(trigger).not.toBeNull();
    expect(trigger).toBeDefined();
    expect(trigger?.textContent).toContain(
      initialStatus === 'completed' ? 'Completada' : 'Pendiente',
    );
    trigger!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (item) => item.textContent?.trim() === label,
    );
    expect(option).toBeDefined();
    option!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    const url = TestBed.inject(Router).url;
    const params = new URLSearchParams(url.split('?')[1]);
    const expectedQuery = { ...initialQuery, status, page: 1 };
    expect(url.split('?')[0]).toBe('/tasks');
    expect(parseTaskQuery(params.toString())).toEqual(expectedQuery);
    expect(params.has('page')).toBe(false);
    expect(params.get('status')).toBe(status || null);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith(expectedQuery);
    expect(harness.routeNativeElement?.textContent).toContain('Filtered task');

    const currentTrigger = statusTrigger(harness);
    expect(currentTrigger?.textContent).toContain(label);

    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(api.list).toHaveBeenCalledTimes(3);
    expect(api.list).toHaveBeenLastCalledWith(initialQuery);
    expect(statusTrigger(harness).textContent).toContain(
      initialStatus === 'completed' ? 'Completada' : 'Pendiente',
    );
  });

  it('searches once 300ms after the last input while preserving filters and resetting the page', async () => {
    api.list.mockResolvedValue(result('Search result'));
    const harness = await RouterTestingHarness.create();
    const initialUrl =
      '/tasks?search=old&status=completed&ownerId=11111111-1111-4111-8111-111111111111' +
      '&dueDate=2026-10-25&sort=title&page=3&limit=50';
    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const input = searchInput(harness);
    expect(input.value).toBe('old');
    expect(api.list).toHaveBeenCalledTimes(1);

    fakeDebounceTimers();
    enterSearch(harness, input, 'Plan');
    await vi.advanceTimersByTimeAsync(200);
    enterSearch(harness, input, ' Plan & review ');
    await vi.advanceTimersByTimeAsync(299);
    expect(input.value).toBe(' Plan & review ');
    expect(TestBed.inject(Router).url).toBe(initialUrl);
    expect(api.list).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await harness.fixture.whenStable();
    harness.detectChanges();

    const params = new URLSearchParams(TestBed.inject(Router).url.split('?')[1]);
    const expected = {
      ...parseTaskQuery(initialUrl.split('?')[1]),
      search: 'Plan & review',
      page: 1,
    };
    expect(parseTaskQuery(params.toString())).toEqual(expected);
    expect(params.has('page')).toBe(false);
    expect(params.get('search')).toBe('Plan & review');
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith(expected);
    expect(input.value).toBe('Plan & review');
    expect(harness.routeNativeElement?.textContent).toContain('Search result');
  });

  it('clears the search parameter after the debounce without clearing the status', async () => {
    api.list.mockResolvedValue(result('Unsearched result'));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tasks?search=old&status=pending&page=3', TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const input = searchInput(harness);

    fakeDebounceTimers();
    enterSearch(harness, input, '');
    await vi.advanceTimersByTimeAsync(299);
    expect(api.list).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await harness.fixture.whenStable();
    harness.detectChanges();

    const params = new URLSearchParams(TestBed.inject(Router).url.split('?')[1]);
    expect(params.has('search')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(params.get('status')).toBe('pending');
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery('status=pending'));
    expect(input.value).toBe('');
    expect(harness.routeNativeElement?.textContent).toContain('Unsearched result');
  });

  it('does not navigate or reset the page for an unchanged normalized search', async () => {
    api.list.mockResolvedValue(result('Same search'));
    const harness = await RouterTestingHarness.create();
    const initialUrl = '/tasks?search=old&page=3';
    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const input = searchInput(harness);

    fakeDebounceTimers();
    enterSearch(harness, input, ' old ');
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe(initialUrl);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery('search=old&page=3'));
  });

  it('synchronizes the search input and cancels a pending debounce after route navigation', async () => {
    api.list.mockResolvedValue(result('Route result'));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tasks?search=old', TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const input = searchInput(harness);

    fakeDebounceTimers();
    enterSearch(harness, input, 'obsolete draft');
    await vi.advanceTimersByTimeAsync(100);
    const nextUrl = '/tasks?search=external&status=pending&page=2';
    const navigation = TestBed.inject(Router).navigateByUrl(nextUrl);
    await vi.advanceTimersByTimeAsync(0);
    await navigation;
    harness.detectChanges();
    expect(input.value).toBe('external');

    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe(nextUrl);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(nextUrl.split('?')[1]));
    expect(input.value).toBe('external');
  });

  it('does not navigate or load a pending search after the component is destroyed', async () => {
    api.list.mockResolvedValue(result('Initial result'));
    const harness = await RouterTestingHarness.create();
    const initialUrl = '/tasks?search=old';
    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const input = searchInput(harness);

    fakeDebounceTimers();
    enterSearch(harness, input, 'unfinished');
    harness.fixture.destroy();
    await vi.advanceTimersByTimeAsync(300);

    expect(TestBed.inject(Router).url).toBe(initialUrl);
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it.each(sortCases)(
    'updates the URL and reloads once when sorting by $label',
    async ({ sort, label }) => {
      const sortedResponse = {
        ...result('Server first'),
        data: [...result('Server first').data, ...result('Server second').data],
      };
      api.list.mockResolvedValue(sortedResponse);
      const harness = await RouterTestingHarness.create();
      const isHeaderSort = /^-?(title|dueDate)$/.test(sort);
      const column = sort === 'title' || sort === '-title' ? 'title' : 'dueDate';
      const initialSort = isHeaderSort
        ? sort.startsWith('-')
          ? column
          : `-${column}`
        : sort === '-createdAt'
          ? 'title'
          : '-createdAt';
      const initialLabel = sortCases.find((item) => item.sort === initialSort)!.label;
      const initialUrl =
        '/tasks?search=Plan%20%26%20review&status=completed' +
        '&ownerId=11111111-1111-4111-8111-111111111111' +
        `&dueDate=2026-10-25&sort=${initialSort}&page=3&limit=50`;
      await harness.navigateByUrl(initialUrl, TaskList);
      await harness.fixture.whenStable();
      harness.detectChanges();
      const initialQuery = parseTaskQuery(initialUrl.split('?')[1]);
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(api.list).toHaveBeenLastCalledWith(initialQuery);

      expect(harness.routeNativeElement!.querySelector('table')?.getAttribute('data-slot')).toBe(
        'table',
      );
      expect(
        harness.routeNativeElement!.querySelector(
          '[role="group"][aria-label="Ordenar tareas"] z-select',
        ),
      ).toBeNull();
      expectColumnSort(harness, initialSort);
      expect(sortMenuTrigger(harness).textContent).toContain(initialLabel);

      if (isHeaderSort) {
        columnHeader(harness, column).querySelector('button')!.click();
      } else {
        sortMenuTrigger(harness).click();
        await harness.fixture.whenStable();
        harness.detectChanges();
        expect(sortMenuTrigger(harness).getAttribute('aria-expanded')).toBe('true');
        expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
        const items = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'));
        expect(items.map((item) => item.textContent?.trim())).toEqual(
          sortCases
            .filter((item) => !/^-?(title|dueDate)$/.test(item.sort))
            .map((item) => item.label),
        );
        const item = items.find((item) => item.textContent?.trim() === label);
        expect(item).toBeDefined();
        item!.click();
      }
      await harness.fixture.whenStable();
      harness.detectChanges();

      if (!isHeaderSort) {
        await vi.waitFor(() => {
          expect(document.body.querySelector('[role="menu"]')).toBeNull();
          expect(sortMenuTrigger(harness).getAttribute('aria-expanded')).toBe('false');
          expect(document.activeElement).toBe(sortMenuTrigger(harness));
        });
      }

      const url = TestBed.inject(Router).url;
      const params = new URLSearchParams(url.split('?')[1]);
      const expectedQuery = { ...initialQuery, sort, page: 1 };
      expect(url.split('?')[0]).toBe('/tasks');
      expect(parseTaskQuery(params.toString())).toEqual(expectedQuery);
      expect(params.get('sort')).toBe(sort === '-createdAt' ? null : sort);
      expect(params.has('page')).toBe(false);
      expect(api.list).toHaveBeenCalledTimes(2);
      expect(api.list).toHaveBeenLastCalledWith(expectedQuery);
      expectColumnSort(harness, sort);
      expect(sortMenuTrigger(harness).textContent).toContain(label);
      expect(searchInput(harness).value).toBe('Plan & review');
      const titles = Array.from(
        harness.routeNativeElement!.querySelectorAll('tbody tr td:first-child'),
        (cell) => cell.textContent?.trim(),
      );
      expect(titles).toEqual(['Server first', 'Server second']);

      await harness.navigateByUrl(initialUrl, TaskList);
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(api.list).toHaveBeenCalledTimes(3);
      expect(api.list).toHaveBeenLastCalledWith(initialQuery);
      expectColumnSort(harness, initialSort);
      expect(sortMenuTrigger(harness).textContent).toContain(initialLabel);
    },
  );

  it.each(['title', 'dueDate'] as const)(
    'starts %s sorting ascending and toggles direction on a second header click',
    async (field) => {
      api.list.mockResolvedValue(result('Header result'));
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/tasks?status=pending&page=3', TaskList);
      await harness.fixture.whenStable();
      harness.detectChanges();
      expectColumnSort(harness, '-createdAt');

      for (const [index, sort] of [field, `-${field}`].entries()) {
        columnHeader(harness, field).querySelector('button')!.click();
        await harness.fixture.whenStable();
        harness.detectChanges();
        const params = new URLSearchParams(TestBed.inject(Router).url.split('?')[1]);
        expect(params.get('sort')).toBe(sort);
        expect(params.get('status')).toBe('pending');
        expect(params.has('page')).toBe(false);
        expect(api.list).toHaveBeenCalledTimes(index + 2);
        expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(`status=pending&sort=${sort}`));
        expectColumnSort(harness, sort);
      }
    },
  );

  it.each([10, 20, 50, 100])(
    'updates page size to %s while preserving filters and resetting the page',
    async (limit) => {
      api.list.mockResolvedValue(result('Page size result'));
      const harness = await RouterTestingHarness.create();
      const initialLimit = limit === 20 ? 50 : 20;
      const initialUrl =
        '/tasks?search=Plan%20%26%20review&status=completed' +
        '&ownerId=11111111-1111-4111-8111-111111111111' +
        `&dueDate=2026-10-25&sort=-title&page=3&limit=${initialLimit}`;
      await harness.navigateByUrl(initialUrl, TaskList);
      await harness.fixture.whenStable();
      harness.detectChanges();
      const initialQuery = parseTaskQuery(initialUrl.split('?')[1]);
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(api.list).toHaveBeenLastCalledWith(initialQuery);
      const trigger = pageSizeTrigger(harness);
      expect(trigger.textContent?.trim()).toBe(String(initialLimit));
      trigger.click();
      await harness.fixture.whenStable();
      harness.detectChanges();

      const options = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'));
      expect(options.map((option) => option.textContent?.trim())).toEqual([
        '10',
        '20',
        '50',
        '100',
      ]);
      const option = options.find((item) => item.textContent?.trim() === String(limit));
      expect(option).toBeDefined();
      option!.click();
      await harness.fixture.whenStable();
      harness.detectChanges();

      const url = TestBed.inject(Router).url;
      const params = new URLSearchParams(url.split('?')[1]);
      const expectedQuery = { ...initialQuery, limit, page: 1 };
      expect(url.split('?')[0]).toBe('/tasks');
      expect(parseTaskQuery(params.toString())).toEqual(expectedQuery);
      expect(params.get('limit')).toBe(limit === 20 ? null : String(limit));
      expect(params.has('page')).toBe(false);
      expect(api.list).toHaveBeenCalledTimes(2);
      expect(api.list).toHaveBeenLastCalledWith(expectedQuery);
      expect(pageSizeTrigger(harness).textContent?.trim()).toBe(String(limit));
      expect(searchInput(harness).value).toBe('Plan & review');
      expect(statusTrigger(harness).textContent).toContain('Completada');
      expectColumnSort(harness, '-title');
      expect(harness.routeNativeElement?.textContent).toContain('Page size result');

      await harness.navigateByUrl(initialUrl, TaskList);
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(api.list).toHaveBeenCalledTimes(3);
      expect(api.list).toHaveBeenLastCalledWith(initialQuery);
      expect(pageSizeTrigger(harness).textContent?.trim()).toBe(String(initialLimit));
    },
  );

  it('preserves a valid non-preset page size supplied by a deep link', async () => {
    api.list.mockResolvedValue(result('Custom size result'));
    const harness = await RouterTestingHarness.create();
    const initialUrl = '/tasks?status=pending&page=3&limit=7';
    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(pageSizeTrigger(harness).textContent?.trim()).toBe('7');
    expect(TestBed.inject(Router).url).toBe(initialUrl);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(initialUrl.split('?')[1]));
    expect(harness.routeNativeElement?.textContent).toContain('Custom size result');
  });

  it.each([
    { action: 'next', initialPage: 2, targetPage: 3 },
    { action: 'previous', initialPage: 2, targetPage: 1 },
    { action: 'number', initialPage: 1, targetPage: 4 },
  ] as const)(
    'navigates with official Pagination using $action and preserves criteria',
    async ({ action, initialPage, targetPage }) => {
      api.list.mockImplementation(async (query) => pagedResult(query?.page, query?.limit));
      const harness = await RouterTestingHarness.create();
      const initialUrl =
        '/tasks?search=Plan%20%26%20review&status=completed' +
        '&ownerId=11111111-1111-4111-8111-111111111111' +
        `&dueDate=2026-10-25&sort=-title&page=${initialPage}`;
      await harness.navigateByUrl(initialUrl, TaskList);
      await harness.fixture.whenStable();
      harness.detectChanges();
      const initialQuery = parseTaskQuery(initialUrl.split('?')[1]);
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(api.list).toHaveBeenLastCalledWith(initialQuery);
      expect(numberedPages(harness)).toHaveLength(4);
      expect(pagination(harness).querySelector('button[aria-current="page"]')).toBe(
        numberedPages(harness)[initialPage - 1],
      );
      expect(harness.routeNativeElement?.textContent?.replace(/\s+/g, ' ')).toContain('Total: 65');

      const button =
        action === 'number'
          ? numberedPages(harness)[targetPage - 1]
          : pageNavigation(harness, action);
      button.click();
      await harness.fixture.whenStable();
      harness.detectChanges();

      const params = new URLSearchParams(TestBed.inject(Router).url.split('?')[1]);
      const expectedQuery = { ...initialQuery, page: targetPage };
      expect(parseTaskQuery(params.toString())).toEqual(expectedQuery);
      expect(params.get('page')).toBe(targetPage === 1 ? null : String(targetPage));
      expect(api.list).toHaveBeenCalledTimes(2);
      expect(api.list).toHaveBeenLastCalledWith(expectedQuery);
      expect(numberedPages(harness)).toHaveLength(4);
      expect(pagination(harness).querySelector('button[aria-current="page"]')).toBe(
        numberedPages(harness)[targetPage - 1],
      );
      expect(harness.routeNativeElement?.textContent).toContain(`Page ${targetPage}`);
      expect(pageSizeTrigger(harness).textContent?.trim()).toBe('20');

      numberedPages(harness)[targetPage - 1].click();
      await harness.fixture.whenStable();
      expect(api.list).toHaveBeenCalledTimes(2);

      await harness.navigateByUrl(initialUrl, TaskList);
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(api.list).toHaveBeenCalledTimes(3);
      expect(api.list).toHaveBeenLastCalledWith(initialQuery);
      expect(pagination(harness).querySelector('button[aria-current="page"]')).toBe(
        numberedPages(harness)[initialPage - 1],
      );
    },
  );

  it.each([1, 4])('prevents navigation beyond the page boundary on page %s', async (page) => {
    api.list.mockResolvedValue(pagedResult(page));
    const harness = await RouterTestingHarness.create();
    const initialUrl = `/tasks?page=${page}`;
    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const blocked = pageNavigation(harness, page === 1 ? 'previous' : 'next');
    const allowed = pageNavigation(harness, page === 1 ? 'next' : 'previous');
    expect(blocked.disabled).toBe(true);
    expect(allowed.disabled).toBe(false);
    blocked.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe(initialUrl);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(`page=${page}`));
  });

  it('keeps the footer mounted and prevents further navigation while a page is loading', async () => {
    const pending = deferred();
    api.list.mockResolvedValueOnce(pagedResult()).mockReturnValueOnce(pending.promise);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tasks?status=pending', TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const pager = pagination(harness);
    const sizeTrigger = pageSizeTrigger(harness);
    const secondPage = numberedPages(harness)[1];
    secondPage.focus();
    secondPage.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Cargando tareas');
    expect(pagination(harness)).toBe(pager);
    expect(pageSizeTrigger(harness)).toBe(sizeTrigger);
    expect(pageNavigation(harness, 'previous').disabled).toBe(true);
    expect(pageNavigation(harness, 'next').disabled).toBe(true);
    expect(
      numberedPages(harness).every((button) => button.getAttribute('aria-disabled') === 'true'),
    ).toBe(true);
    numberedPages(harness)[2].click();
    await harness.fixture.whenStable();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(parseTaskQuery(TestBed.inject(Router).url.split('?')[1])).toEqual(
      parseTaskQuery('status=pending&page=2'),
    );

    pending.resolve(pagedResult(2));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(pagination(harness)).toBe(pager);
    expect(pageSizeTrigger(harness)).toBe(sizeTrigger);
    expect(document.activeElement).toBe(secondPage);
    expect(pageNavigation(harness, 'next').disabled).toBe(false);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery('status=pending&page=2'));
    expect(harness.routeNativeElement?.textContent).toContain('Page 2');
  });

  it('disables Pagination for an empty response with zero total pages', async () => {
    api.list.mockResolvedValue(pagedResult(1, 20, 0));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tasks', TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('No hay tareas');
    expect(numberedPages(harness)).toHaveLength(0);
    expect(pageNavigation(harness, 'previous').disabled).toBe(true);
    expect(pageNavigation(harness, 'next').disabled).toBe(true);
    pageNavigation(harness, 'next').click();
    pageNavigation(harness, 'previous').click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/tasks');
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('keeps Pagination disabled after an error and recovers through retry without losing metadata', async () => {
    api.list
      .mockResolvedValueOnce(pagedResult())
      .mockRejectedValueOnce(new Error('Page failed'))
      .mockResolvedValueOnce(pagedResult(2));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tasks?status=pending', TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const pager = pagination(harness);
    pageNavigation(harness, 'next').click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudieron cargar las tareas',
    );
    expect(pagination(harness)).toBe(pager);
    expect(numberedPages(harness)).toHaveLength(4);
    expect(pageNavigation(harness, 'next').disabled).toBe(true);
    const retry = Array.from(harness.routeNativeElement!.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Reintentar',
    );
    expect(retry).toBeDefined();
    retry!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(api.list).toHaveBeenCalledTimes(3);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery('status=pending&page=2'));
    expect(pagination(harness)).toBe(pager);
    expect(pageNavigation(harness, 'next').disabled).toBe(false);
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Page 2');
  });

  it('does not overwrite current pagination metadata when an obsolete request finishes', async () => {
    const older = deferred();
    const newer = deferred();
    api.list.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tasks?page=1', TaskList);
    await harness.navigateByUrl('/tasks?page=2', TaskList);
    newer.resolve(pagedResult(2, 20, 45));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(numberedPages(harness)).toHaveLength(3);

    older.resolve(pagedResult(1, 20, 65));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(numberedPages(harness)).toHaveLength(3);
    expect(pagination(harness).querySelector('button[aria-current="page"]')).toBe(
      numberedPages(harness)[1],
    );
    expect(harness.routeNativeElement?.textContent?.replace(/\s+/g, ' ')).toContain('Total: 45');
    expect(harness.routeNativeElement?.textContent).toContain('Page 2');
  });

  it.each([
    { initialDate: '2026-10-25', selectedDate: '2026-10-26' },
    { initialDate: '2024-02-28', selectedDate: '2024-02-29' },
  ])(
    'filters by the calendar day $selectedDate without shifting it and preserves other criteria',
    async ({ initialDate, selectedDate }) => {
      api.list.mockResolvedValue(result('Date-filtered task'));
      const harness = await RouterTestingHarness.create();
      const initialUrl =
        '/tasks?search=Plan%20%26%20review&status=completed' +
        '&ownerId=11111111-1111-4111-8111-111111111111' +
        `&dueDate=${initialDate}&sort=-title&page=3&limit=50`;
      await harness.navigateByUrl(initialUrl, TaskList);
      await harness.fixture.whenStable();
      harness.detectChanges();
      const initialQuery = parseTaskQuery(initialUrl.split('?')[1]);
      expect(dueDateTrigger(harness).textContent).toContain(dateLabel(initialDate));
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(api.list).toHaveBeenLastCalledWith(initialQuery);

      await selectDueDate(harness, selectedDate);
      const params = new URLSearchParams(TestBed.inject(Router).url.split('?')[1]);
      const expectedQuery = { ...initialQuery, dueDate: selectedDate, page: 1 };
      expect(parseTaskQuery(params.toString())).toEqual(expectedQuery);
      expect(params.get('dueDate')).toBe(selectedDate);
      expect(params.has('page')).toBe(false);
      expect(api.list).toHaveBeenCalledTimes(2);
      expect(api.list).toHaveBeenLastCalledWith(expectedQuery);
      expect(dueDateTrigger(harness).textContent).toContain(dateLabel(selectedDate));
      expect(searchInput(harness).value).toBe('Plan & review');
      expect(statusTrigger(harness).textContent).toContain('Completada');
      expect(pageSizeTrigger(harness).textContent?.trim()).toBe('50');
      expectColumnSort(harness, '-title');
      expect(harness.routeNativeElement?.textContent).toContain('Date-filtered task');

      await harness.navigateByUrl(initialUrl, TaskList);
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(api.list).toHaveBeenCalledTimes(3);
      expect(api.list).toHaveBeenLastCalledWith(initialQuery);
      expect(dueDateTrigger(harness).textContent).toContain(dateLabel(initialDate));
    },
  );

  it('clears the due-date filter without losing other criteria and can restore it from the URL', async () => {
    api.list.mockResolvedValue(result('Unfiltered date result'));
    const harness = await RouterTestingHarness.create();
    const initialUrl =
      '/tasks?search=report&status=pending&dueDate=2026-10-25&sort=title&page=3&limit=50';
    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const initialQuery = parseTaskQuery(initialUrl.split('?')[1]);
    expect(dueDateTrigger(harness).textContent).toContain(dateLabel('2026-10-25'));
    expect(clearDueDate(harness).disabled).toBe(false);
    clearDueDate(harness).click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    const params = new URLSearchParams(TestBed.inject(Router).url.split('?')[1]);
    expect(parseTaskQuery(params.toString())).toEqual({ ...initialQuery, dueDate: '', page: 1 });
    expect(params.has('dueDate')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith({ ...initialQuery, dueDate: '', page: 1 });
    expect(dueDateTrigger(harness).textContent).toContain('Todas las fechas');
    expect(clearDueDate(harness).disabled).toBe(true);
    clearDueDate(harness).click();
    await harness.fixture.whenStable();
    expect(api.list).toHaveBeenCalledTimes(2);

    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(api.list).toHaveBeenCalledTimes(3);
    expect(api.list).toHaveBeenLastCalledWith(initialQuery);
    expect(dueDateTrigger(harness).textContent).toContain(dateLabel('2026-10-25'));
    expect(clearDueDate(harness).disabled).toBe(false);
  });

  it('shows an empty due-date filter without changing the initial query', async () => {
    api.list.mockResolvedValue(result('All dates'));
    const harness = await RouterTestingHarness.create();
    const initialUrl = '/tasks?status=pending&page=2';
    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(dueDateTrigger(harness).textContent).toContain('Todas las fechas');
    expect(clearDueDate(harness).disabled).toBe(true);
    clearDueDate(harness).click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(initialUrl);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(initialUrl.split('?')[1]));
  });

  it('does not reload or reset the page when picking the already selected due date', async () => {
    api.list.mockResolvedValue(result('Same date'));
    const harness = await RouterTestingHarness.create();
    const initialUrl = '/tasks?status=pending&dueDate=2026-10-25&page=3';
    await harness.navigateByUrl(initialUrl, TaskList);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(dueDateTrigger(harness).textContent).toContain(dateLabel('2026-10-25'));

    await selectDueDate(harness, '2026-10-25');
    expect(TestBed.inject(Router).url).toBe(initialUrl);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenLastCalledWith(parseTaskQuery(initialUrl.split('?')[1]));
    expect(dueDateTrigger(harness).textContent).toContain(dateLabel('2026-10-25'));
  });
});
