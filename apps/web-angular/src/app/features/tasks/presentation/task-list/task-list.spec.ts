import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, type Params, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { SessionStore } from '@/features/auth/application/session-store';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import type { TaskListResponse } from '../../domain/task-model';
import { TASK_QUERY_DEFAULTS, type TaskQueryState } from '../../domain/task-query';
import { TasksApi } from '../../infrastructure/tasks-api';
import { TaskList } from './task-list';

describe('TaskList', () => {
  let fixture: ComponentFixture<TaskList>;
  let host: HTMLElement;
  const api = { list: vi.fn<(query?: TaskQueryState) => Promise<TaskListResponse>>() };
  const queryParams = new BehaviorSubject(convertToParamMap({}));
  const route = {
    snapshot: { queryParamMap: queryParams.value },
    queryParamMap: queryParams.asObservable(),
  };
  const response: TaskListResponse = {
    data: [
      {
        id: 'example-task-id',
        ownerId: 'example-user-id',
        title: 'Prepare the weekly report',
        description: 'Prepare a summary for the team',
        status: 'pending',
        dueDate: '2026-10-25',
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      },
      {
        id: 'another-task-id',
        ownerId: 'example-user-id',
        title: 'Archive the completed report',
        description: null,
        status: 'completed',
        dueDate: null,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      },
    ],
    meta: { page: 1, limit: 20, totalItems: 2, totalPages: 1 },
  };
  const emptyResponse: TaskListResponse = {
    data: [],
    meta: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
  };
  const latestResponse: TaskListResponse = {
    data: [{ ...response.data[0], title: 'Latest route result' }],
    meta: { page: 2, limit: 20, totalItems: 21, totalPages: 2 },
  };

  beforeEach(() => {
    api.list.mockReset();
    setRouteQuery({});
    TestBed.configureTestingModule({
      imports: [TaskList],
      providers: [
        provideZard(),
        provideRouter([]),
        { provide: SessionStore, useValue: { state: () => ({ status: 'unauthenticated' }) } },
        { provide: TasksApi, useValue: api },
        { provide: ActivatedRoute, useValue: route },
      ],
    });
  });

  function render() {
    fixture = TestBed.createComponent(TaskList);
    host = fixture.nativeElement;
    fixture.detectChanges();
  }

  async function settle() {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function setRouteQuery(params: Params) {
    const paramMap = convertToParamMap(params);
    route.snapshot.queryParamMap = paramMap;
    queryParams.next(paramMap);
  }

  function pendingResponse() {
    let resolve!: (value: TaskListResponse) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<TaskListResponse>((complete, fail) => {
      resolve = complete;
      reject = fail;
    });
    return { promise, resolve, reject };
  }

  function retryButton() {
    return Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Reintentar',
    );
  }

  it('announces loading while the initial list request is pending', async () => {
    const pending = pendingResponse();
    api.list.mockReturnValue(pending.promise);
    render();

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Cargando tareas');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).not.toContain('No hay tareas');

    pending.resolve(emptyResponse);
    await settle();
  });

  it('renders the returned task titles and removes loading feedback', async () => {
    api.list.mockResolvedValue(response);
    render();
    await settle();

    expect(api.list).toHaveBeenCalledTimes(1);
    for (const task of response.data) {
      expect(host.textContent).toContain(task.title);
    }
    const rows = Array.from(host.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(response.data.length);
    response.data.forEach((task, index) => {
      const cells = Array.from(rows[index].querySelectorAll('td'), (cell) =>
        cell.textContent?.trim(),
      );
      expect(cells).toEqual([
        task.title,
        task.description ?? '—',
        task.status,
        task.dueDate ?? '—',
      ]);
    });
    expect(host.textContent?.replace(/\s+/g, ' ')).toContain(`Total: ${response.meta.totalItems}`);
    expect(host.textContent).not.toContain('Cargando tareas');
    expect(host.textContent).not.toContain('No hay tareas');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows an empty message after a successful response with no tasks', async () => {
    api.list.mockResolvedValue(emptyResponse);
    render();
    await settle();

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('No hay tareas');
    expect(host.textContent).not.toContain('Cargando tareas');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('announces a failed request and offers a retry instead of an empty state', async () => {
    api.list.mockRejectedValue(new Error('Request failed'));
    render();
    await settle();

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudieron cargar las tareas',
    );
    expect(retryButton()).toBeDefined();
    expect(host.textContent).not.toContain('Cargando tareas');
    expect(host.textContent).not.toContain('No hay tareas');
  });

  it('retries a failed request, clears the error, and renders the recovered list', async () => {
    const pending = pendingResponse();
    api.list
      .mockRejectedValueOnce(new Error('Request failed'))
      .mockReturnValueOnce(pending.promise);
    render();
    await settle();

    const retry = retryButton();
    expect(retry).toBeDefined();
    retry!.click();
    fixture.detectChanges();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Cargando tareas');

    pending.resolve(response);
    await settle();

    for (const task of response.data) {
      expect(host.textContent).toContain(task.title);
    }
    expect(host.textContent).not.toContain('Cargando tareas');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(retryButton()).toBeUndefined();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('loads and renders tasks using the normalized initial route query', async () => {
    setRouteQuery({
      search: ' Plan & review ',
      status: 'completed',
      ownerId: '11111111-1111-4111-8111-111111111111',
      dueDate: '2024-02-29',
      sort: 'title',
      page: '2',
      limit: '50',
    });
    api.list.mockResolvedValue(response);
    render();
    await settle();

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledWith({
      search: 'Plan & review',
      status: 'completed',
      ownerId: '11111111-1111-4111-8111-111111111111',
      dueDate: '2024-02-29',
      sort: 'title',
      page: 2,
      limit: 50,
    });
    expect(host.textContent).toContain(response.data[0].title);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('uses safe query defaults for invalid initial route parameters', async () => {
    setRouteQuery({
      status: 'archived',
      sort: 'priority',
      dueDate: '2026-04-31',
      page: '0',
      limit: '101',
    });
    api.list.mockResolvedValue(emptyResponse);
    render();
    await settle();

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledWith(TASK_QUERY_DEFAULTS);
    expect(host.textContent).toContain('No hay tareas');
  });

  it('retries with the same initial route criteria after a failed request', async () => {
    setRouteQuery({
      status: 'pending',
      page: '3',
      limit: '50',
    });
    const query: TaskQueryState = {
      ...TASK_QUERY_DEFAULTS,
      status: 'pending',
      page: 3,
      limit: 50,
    };
    api.list.mockRejectedValueOnce(new Error('Request failed')).mockResolvedValueOnce(response);
    render();
    await settle();

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    retryButton()!.click();
    await settle();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenNthCalledWith(1, query);
    expect(api.list).toHaveBeenNthCalledWith(2, query);
    expect(host.textContent).toContain(response.data[0].title);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('reloads in the same component when route criteria change', async () => {
    const pending = pendingResponse();
    api.list.mockResolvedValueOnce(response).mockReturnValueOnce(pending.promise);
    render();
    await settle();

    setRouteQuery({ page: '2' });
    fixture.detectChanges();
    const loadingText = host.querySelector('[role="status"]')?.textContent ?? '';
    pending.resolve(latestResponse);
    await settle();

    expect(loadingText).toContain('Cargando tareas');
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith({ ...TASK_QUERY_DEFAULTS, page: 2 });
    expect(host.textContent).toContain('Latest route result');
    expect(host.textContent).not.toContain(response.data[0].title);
    expect(host.textContent?.replace(/\s+/g, ' ')).toContain('Total: 21');
  });

  it('keeps the newest result when an older route request resolves later', async () => {
    const older = pendingResponse();
    const newer = pendingResponse();
    api.list.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    render();
    setRouteQuery({ page: '2' });

    newer.resolve(latestResponse);
    await settle();
    older.resolve(response);
    await settle();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Latest route result');
    expect(host.textContent).not.toContain(response.data[0].title);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the newest result when an older route request fails later', async () => {
    const older = pendingResponse();
    api.list.mockReturnValueOnce(older.promise).mockResolvedValueOnce(latestResponse);
    render();
    setRouteQuery({ page: '2' });
    await settle();
    older.reject(new Error('Obsolete request failed'));
    await settle();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Latest route result');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not reload when route parameters normalize to the same criteria', async () => {
    api.list.mockResolvedValue(emptyResponse);
    render();
    await settle();

    setRouteQuery({ page: '1', limit: '20', sort: '-createdAt', unexpected: 'value' });
    await settle();

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('No hay tareas');
  });

  it('stops reacting to route parameters after the component is destroyed', async () => {
    api.list.mockResolvedValue(emptyResponse);
    render();
    await settle();
    fixture.destroy();

    setRouteQuery({ page: '2' });
    await Promise.resolve();

    expect(api.list).toHaveBeenCalledTimes(1);
  });
});
