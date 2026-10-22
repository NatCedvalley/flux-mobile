import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterLink, provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import type { FluxApi, MyProject, Task, WorkflowStatus } from '@core/api';
import type { GroupBy, PagerState } from '@core/project-list';
import type { TaskFilters } from '@core/task-filters';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import {
  CachingFluxApi,
  MemoryCacheStore,
  ResponseCache,
  type StatusChangeRequest,
} from '@core/offline';
import type { Pickup } from '../../board/task-board/board-drag';
import { AuthService } from '../../auth/auth.service';
import { TaskBoardComponent } from '../../board/task-board/task-board.component';
import {
  TaskCalendarComponent,
  UNSCHEDULED,
} from '../../calendar/task-calendar/task-calendar.component';
import { ConnectivityService } from '../../offline/connectivity.service';
import { WriteQueueService } from '../../offline/write-queue.service';
import { ProjectPrefsService } from '../../projects/project-prefs.service';
import { FLUX_API } from '../../providers/flux-api.token';
import {
  type CreateTaskOptions,
  CreateTaskLauncherService,
} from '../../task-create/create-task-launcher.service';
import { TaskChangesService } from '../../task-status/task-changes.service';
import { ProjectTasksPage } from './project-tasks.page';

/** Stands in for Preferences: pins and the last project, in memory. */
function fakePrefs(lastId: string | null = null, pinned: string[] = []) {
  const pins = signal(pinned);
  return {
    pinned: pins.asReadonly(),
    load: vi.fn().mockResolvedValue(undefined),
    lastProjectId: vi.fn().mockResolvedValue(lastId),
    setLastProject: vi.fn().mockResolvedValue(undefined),
    togglePin: vi.fn((id: string) => {
      pins.update((ids) =>
        ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
      );
      return Promise.resolve();
    }),
  };
}

describe('ProjectTasksPage', () => {
  let fixture: ComponentFixture<ProjectTasksPage>;
  let api: FluxApi;
  let prefs: ReturnType<typeof fakePrefs>;
  let toast: { create: ReturnType<typeof vi.fn> };
  let launcher: { open: ReturnType<typeof vi.fn> };
  let online: ReturnType<typeof signal<boolean>>;

  async function create(
    options: {
      api?: FluxApi;
      prefs?: ReturnType<typeof fakePrefs>;
      defaultGroupBy?: string;
      defaultView?: string;
      /** Status changes already queued offline when the page opens. */
      queued?: StatusChangeRequest[];
    } = {}
  ) {
    api = options.api ?? new InMemoryFluxApi();
    prefs = options.prefs ?? fakePrefs();
    toast = {
      create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
    };
    launcher = { open: vi.fn().mockResolvedValue(undefined) };
    online = signal(true);
    await TestBed.configureTestingModule({
      imports: [ProjectTasksPage],
      providers: [
        provideRouter([]),
        {
          provide: FLUX_API,
          // With changes queued, reads show their statuses, as in main.ts.
          useValue: options.queued
            ? new CachingFluxApi(
                api,
                new ResponseCache(new MemoryCacheStore()),
                {
                  accountId: () => 'a1',
                  online: () => online(),
                  queuedStatus: (id) =>
                    TestBed.inject(WriteQueueService).queue.queuedStatus(id),
                }
              )
            : api,
        },
        { provide: ProjectPrefsService, useValue: prefs },
        { provide: ToastController, useValue: toast },
        { provide: CreateTaskLauncherService, useValue: launcher },
        { provide: ConnectivityService, useValue: { online } },
        {
          provide: AuthService,
          useValue: {
            account: signal({
              id: 'a1',
              defaultGroupBy: options.defaultGroupBy,
              defaultView: options.defaultView,
            }),
          },
        },
      ],
    }).compileComponents();
    const writeQueue = TestBed.inject(WriteQueueService);
    await writeQueue.queue.load('a1');
    for (const change of options.queued ?? []) {
      await writeQueue.enqueueStatus(change);
    }

    fixture = TestBed.createComponent(ProjectTasksPage);
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function texts(selector: string): string[] {
    return Array.from(element().querySelectorAll(selector)).map(
      (e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );
  }

  /** Each group header as `Name count`. */
  function headers(): string[] {
    return Array.from(element().querySelectorAll('ion-item-divider')).map(
      (d) =>
        `${d.querySelector('.group-name')?.textContent} ${d.querySelector('.group-count')?.textContent}`
    );
  }

  function switcherOpen(): boolean {
    return (
      fixture.componentInstance as unknown as { switcherOpen(): boolean }
    ).switcherOpen();
  }

  /** The page's protected sheet handlers, as the sheets call them. */
  function page() {
    return fixture.componentInstance as unknown as {
      filterDraft: { set(filters: TaskFilters): void };
      openFilters(): void;
      filtersClosed(): void;
      filterOpen(): boolean;
      chooseGroupBy(groupBy: GroupBy): void;
      chooseSort(sort: string): void;
    };
  }

  /** Opens the filter sheet, edits it to `filters`, and closes it. */
  async function applyFilters(filters: Partial<TaskFilters>): Promise<void> {
    page().openFilters();
    page().filterDraft.set({
      statuses: [],
      priorities: [],
      assigneeIds: [],
      ...filters,
    });
    page().filtersClosed();
    await settle();
  }

  /** Calls the page's switcher handler, as picking a row in the sheet does. */
  async function choose(project: MyProject): Promise<void> {
    (
      fixture.componentInstance as unknown as {
        choose(project: MyProject): void;
      }
    ).choose(project);
    await settle();
  }

  it('shows the open project in the header, with role and counts', async () => {
    await create();
    await settle();

    expect(texts('.project-name')).toEqual(['Checkout']);
    expect(texts('.project-avatar')).toEqual(['CH']);
    expect(texts('.project-subline')).toEqual(['Editor · 4 open · 1 overdue']);
  });

  it('asks for the projects with the device time zone', async () => {
    const withSpy = new InMemoryFluxApi();
    const listMyProjects = vi.spyOn(withSpy, 'listMyProjects');
    await create({ api: withSpy });
    await settle();

    expect(listMyProjects).toHaveBeenCalledWith({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      size: 100,
    });
  });

  it('groups the tasks by status in workflow order, without AI candidates', async () => {
    await create();
    await settle();

    expect(texts('.group-by-button')).toEqual(['Grouped by status']);
    expect(headers()).toEqual([
      'Backlog 1',
      'To Do 1',
      'In Progress 1',
      'Done 1',
    ]);
    expect(texts('app-project-task-row .key')).toEqual([
      'CHK-131',
      'CHK-150',
      'CHK-142',
      'CHK-120',
    ]);
  });

  it('shows a task whose status change is queued in its new group, with the glyph', async () => {
    await create({
      queued: [
        {
          projectId: 'p1',
          taskId: '2', // CHK-150, to do on the server
          taskKey: 'CHK-150',
          from: { slug: 'todo' },
          to: { slug: 'in_progress', category: 'IN_PROGRESS' },
        },
      ],
    });
    await settle();
    await settle();

    expect(headers()).toEqual(['Backlog 1', 'In Progress 2', 'Done 1']);
    const row = Array.from(
      element().querySelectorAll('app-project-task-row')
    ).find((r) => r.querySelector('.key')?.textContent === 'CHK-150');
    expect(row?.querySelector('.sync')).not.toBeNull();
  });

  it('colours each group header from its status', async () => {
    await create();
    await settle();

    const divider =
      element().querySelectorAll<HTMLElement>('ion-item-divider')[2];
    expect(divider.style.getPropertyValue('--group-dot')).toBe(
      'var(--flux-amber9)'
    );
    expect(divider.style.getPropertyValue('--group-wash')).toBe(
      'var(--flux-ambera2)'
    );
  });

  it('links a row to task detail within the tab', async () => {
    await create();
    await settle();

    const item = element().querySelector('app-project-task-row ion-item');
    expect(item?.getAttribute('href')).toBe('/tasks/p1/4');
  });

  it('reopens the project used last', async () => {
    await create({ prefs: fakePrefs('p2') });
    await settle();

    expect(texts('.project-name')).toEqual(['Billing']);
    expect(headers()).toEqual(['To Do 2', 'In Progress 1']);
  });

  it('opens the first pinned project when there is no last one', async () => {
    await create({ prefs: fakePrefs(null, ['p2']) });
    await settle();

    expect(texts('.project-name')).toEqual(['Billing']);
    expect(prefs.setLastProject).toHaveBeenCalledWith('p2');
  });

  it("groups by the project's override first", async () => {
    await create({
      api: new InMemoryFluxApi().setTaskViewSettings('p1', {
        groupBy: 'priority',
      }),
      defaultGroupBy: 'type',
    });
    await settle();

    expect(texts('.group-by-button')).toEqual(['Grouped by priority']);
    expect(headers()).toEqual(['Critical 1', 'Medium 2', 'Low 1']);
  });

  it("falls back to the account's default, here ungrouped", async () => {
    await create({ defaultGroupBy: 'none' });
    await settle();

    expect(texts('.group-by-button')).toEqual(['Not grouped']);
    expect(element().querySelector('ion-item-divider')).toBeNull();
    expect(texts('app-project-task-row .key')).toHaveLength(4);
  });

  it('links the search button to the open project’s search', async () => {
    await create();
    await settle();

    const link = fixture.debugElement
      .query(By.css('.icon-button.search'))
      .injector.get(RouterLink);
    expect(link.urlTree?.toString()).toBe(
      '/search?project=p1&sort=createdAt,desc'
    );
  });

  it('shows the Filters button with no badge until a filter is applied', async () => {
    await create();
    await settle();

    expect(texts('app-filter-button')).toEqual(['Filters']);
    expect(element().querySelector('app-filter-button ion-badge')).toBeNull();
  });

  it('refetches with the filters as comma lists and counts them on the badge', async () => {
    await create();
    await settle();
    const listProjectTasks = vi.spyOn(api, 'listProjectTasks');

    await applyFilters({ assigneeIds: ['a1', 'a2'], priorities: ['CRITICAL'] });

    expect(listProjectTasks).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ assigneeId: 'a1,a2', priority: 'CRITICAL' })
    );
    expect(texts('app-project-task-row .key')).toEqual(['CHK-142']);
    expect(texts('app-filter-button ion-badge')).toEqual(['2']);
  });

  it('keeps just the chosen status groups when filtering by status', async () => {
    await create();
    await settle();

    await applyFilters({ statuses: ['todo', 'done'] });

    expect(headers()).toEqual(['To Do 1', 'Done 1']);
  });

  it('applies the filter sheet only when it closes, and only if changed', async () => {
    await create();
    await settle();
    const listProjectTasks = vi.spyOn(api, 'listProjectTasks');

    page().openFilters();
    page().filterDraft.set({
      statuses: ['todo'],
      priorities: [],
      assigneeIds: [],
    });
    await settle();
    expect(listProjectTasks).not.toHaveBeenCalled();

    page().filtersClosed();
    await settle();
    expect(listProjectTasks).toHaveBeenCalled();

    listProjectTasks.mockClear();
    page().openFilters();
    page().filtersClosed();
    await settle();
    expect(listProjectTasks).not.toHaveBeenCalled();
  });

  it('says when nothing matches the filters, and Clear filters restores the list', async () => {
    await create();
    await settle();

    await applyFilters({ priorities: ['HIGH'] });
    expect(texts('app-empty-state p')).toEqual([
      'No tasks match these filters',
    ]);

    element().querySelector<HTMLElement>('.clear-filters')!.click();
    await settle();
    expect(texts('app-project-task-row .key')).toHaveLength(4);
    expect(element().querySelector('app-filter-button ion-badge')).toBeNull();
  });

  it('loads the assignees when the filter sheet first opens', async () => {
    const counted = new InMemoryFluxApi();
    const listAssignableMembers = vi.spyOn(counted, 'listAssignableMembers');
    await create({ api: counted });
    await settle();
    expect(listAssignableMembers).not.toHaveBeenCalled();

    page().openFilters();
    await settle();
    page().filtersClosed();
    page().openFilters();
    await settle();

    expect(page().filterOpen()).toBe(true);
    expect(listAssignableMembers.mock.calls).toEqual([['p1']]);
  });

  it('forgets the filters when the project changes', async () => {
    await create();
    await settle();
    await applyFilters({ priorities: ['HIGH'] });
    const [checkout, billing] = (await api.listMyProjects()).content!;

    await choose(billing);
    expect(element().querySelector('app-filter-button ion-badge')).toBeNull();
    expect(texts('app-project-task-row .key')).toHaveLength(3);

    await choose(checkout);
    expect(texts('app-project-task-row .key')).toHaveLength(4);
  });

  it('regroups from the view options and saves it as the project’s override', async () => {
    await create();
    await settle();
    const updateTaskViewSettings = vi.spyOn(api, 'updateTaskViewSettings');

    page().chooseGroupBy('priority');
    await settle();

    expect(texts('.group-by-button')).toEqual(['Grouped by priority']);
    expect(headers()).toEqual(['Critical 1', 'Medium 2', 'Low 1']);
    expect(updateTaskViewSettings).toHaveBeenCalledWith('p1', {
      groupBy: 'priority',
    });
  });

  it('keeps the new grouping when saving it fails', async () => {
    await create();
    await settle();
    vi.spyOn(api, 'updateTaskViewSettings').mockRejectedValue(new ApiError(0));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    page().chooseGroupBy('none');
    await settle();

    expect(texts('.group-by-button')).toEqual(['Not grouped']);
    expect(element().querySelector('ion-item-divider')).toBeNull();
  });

  it('sorts on the server by the chosen sort, kept across projects', async () => {
    await create({ defaultGroupBy: 'none' });
    await settle();
    const listProjectTasks = vi.spyOn(api, 'listProjectTasks');

    page().chooseSort('taskNumber,asc');
    await settle();

    expect(listProjectTasks).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ sort: 'taskNumber,asc' })
    );
    expect(texts('app-project-task-row .key')).toEqual([
      'CHK-120',
      'CHK-131',
      'CHK-142',
      'CHK-150',
    ]);

    await choose((await api.listMyProjects()).content![1]);
    expect(listProjectTasks).toHaveBeenLastCalledWith(
      'p2',
      expect.objectContaining({ sort: 'taskNumber,asc' })
    );
  });

  it("applies the project's AI filter", async () => {
    await create({
      api: new InMemoryFluxApi().setTaskViewSettings('p1', {
        aiTaskFilter: 'ai-only',
      }),
    });
    await settle();

    expect(texts('app-project-task-row .key')).toEqual(['CHK-160']);
  });

  it('loads the next page as you scroll, group by group', async () => {
    await create({
      api: new InMemoryFluxApi().addProjectTasks('p1', 60, 'backlog'),
    });
    await settle();

    // Backlog has 61 tasks: only its first 50 show, and no later group.
    expect(headers()).toEqual(['Backlog 61']);
    expect(element().querySelectorAll('app-project-task-row')).toHaveLength(50);

    const infinite = element().querySelector('ion-infinite-scroll')!;
    const complete = vi.fn().mockResolvedValue(undefined);
    Object.assign(infinite, { complete });
    infinite.dispatchEvent(new CustomEvent('ionInfinite'));
    await settle();
    await settle();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(headers()).toEqual([
      'Backlog 61',
      'To Do 1',
      'In Progress 1',
      'Done 1',
    ]);
    expect(element().querySelectorAll('app-project-task-row')).toHaveLength(64);
    expect((infinite as unknown as { disabled?: boolean }).disabled).toBe(true);
  });

  it('says so when the next page fails, and Retry loads it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const flaky = new InMemoryFluxApi().addProjectTasks('p1', 60, 'backlog');
    await create({ api: flaky });
    await settle();
    const listProjectTasks = vi
      .spyOn(flaky, 'listProjectTasks')
      .mockRejectedValueOnce(new ApiError(0));

    const infinite = element().querySelector('ion-infinite-scroll')!;
    const complete = vi.fn().mockResolvedValue(undefined);
    Object.assign(infinite, { complete });
    infinite.dispatchEvent(new CustomEvent('ionInfinite'));
    await settle();
    await settle();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(texts('.load-more-error span')).toEqual([
      "Couldn't load more tasks.",
    ]);
    expect((infinite as unknown as { disabled?: boolean }).disabled).toBe(true);
    expect(element().querySelectorAll('app-project-task-row')).toHaveLength(50);

    element()
      .querySelector<HTMLElement>('.load-more-error ion-button')!
      .click();
    await settle();
    await settle();

    expect(listProjectTasks).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ status: 'backlog', page: 1 })
    );
    expect(element().querySelector('.load-more-error')).toBeNull();
    expect(element().querySelectorAll('app-project-task-row')).toHaveLength(64);
  });

  it('says the next page needs a connection while offline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const flaky = new InMemoryFluxApi().addProjectTasks('p1', 60, 'backlog');
    await create({ api: flaky });
    await settle();
    online.set(false);
    vi.spyOn(flaky, 'listProjectTasks').mockRejectedValueOnce(new ApiError(0));

    const infinite = element().querySelector('ion-infinite-scroll')!;
    Object.assign(infinite, { complete: vi.fn().mockResolvedValue(undefined) });
    infinite.dispatchEvent(new CustomEvent('ionInfinite'));
    await settle();
    await settle();

    expect(texts('.load-more-error span')).toEqual([
      'Loading more needs a connection.',
    ]);
  });

  it('switches project from the switcher and remembers it', async () => {
    await create();
    await settle();

    element().querySelector<HTMLElement>('.switcher-button')!.click();
    fixture.detectChanges();
    expect(switcherOpen()).toBe(true);

    const billing = (await api.listMyProjects()).content![1];
    await choose(billing);
    await settle();

    expect(texts('.project-name')).toEqual(['Billing']);
    expect(texts('app-project-task-row .key')).toEqual([
      'BIL-88',
      'BIL-90',
      'BIL-75',
    ]);
    expect(prefs.setLastProject).toHaveBeenLastCalledWith('p2');
    expect(switcherOpen()).toBe(false);
  });

  it("fetches a project's workflow statuses only once", async () => {
    const counted = new InMemoryFluxApi();
    const listWorkflowStatuses = vi.spyOn(counted, 'listWorkflowStatuses');
    await create({ api: counted });
    await settle();
    const [checkout, billing] = (await api.listMyProjects()).content!;

    await choose(billing);
    await choose(checkout);

    expect(listWorkflowStatuses.mock.calls.map(([id]) => id)).toEqual([
      'p1',
      'p2',
    ]);
    expect(texts('.project-name')).toEqual(['Checkout']);
  });

  it('reloads on pull-to-refresh and completes the refresher once loaded', async () => {
    await create();
    await settle();
    const listProjectTasks = vi.spyOn(api, 'listProjectTasks');
    const refresher = element().querySelector('ion-refresher')!;
    const complete = vi.fn().mockResolvedValue(undefined);
    Object.assign(refresher, { complete });

    refresher.dispatchEvent(new CustomEvent('ionRefresh'));
    expect(complete).not.toHaveBeenCalled();
    // The rows stay while it reloads.
    expect(element().querySelectorAll('app-project-task-row')).toHaveLength(4);
    await settle();

    // One request per status group.
    expect(listProjectTasks).toHaveBeenCalledTimes(4);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('keeps the rows on pull-to-refresh while offline, and says so', async () => {
    await create();
    await settle();
    online.set(false);
    const listProjectTasks = vi.spyOn(api, 'listProjectTasks');
    const listMyProjects = vi.spyOn(api, 'listMyProjects');
    const refresher = element().querySelector('ion-refresher')!;
    const complete = vi.fn().mockResolvedValue(undefined);
    Object.assign(refresher, { complete });

    refresher.dispatchEvent(new CustomEvent('ionRefresh'));
    await settle();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(listProjectTasks).not.toHaveBeenCalled();
    expect(listMyProjects).not.toHaveBeenCalled();
    expect(element().querySelectorAll('app-project-task-row')).toHaveLength(4);
    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'You’re offline. Showing saved work.',
        positionAnchor: 'tab-bar',
      })
    );
  });

  it('shows skeleton rows while the projects load', async () => {
    const pending: FluxApi = {
      ...new InMemoryFluxApi(),
      listMyProjects: () => new Promise(() => undefined),
    } as FluxApi;
    await create({ api: pending });

    expect(element().querySelector('app-skeleton-rows')).not.toBeNull();
    expect(element().querySelector('.switcher-button')).toBeNull();
  });

  it('says so when the user is on no projects', async () => {
    const none = new InMemoryFluxApi();
    vi.spyOn(none, 'listMyProjects').mockResolvedValue({ content: [] });
    await create({ api: none });
    await settle();

    expect(texts('app-empty-state p')).toEqual([
      "You're not on any projects yet.",
    ]);
    expect(texts('h1')).toEqual(['Projects']);
  });

  it('says so when the project has no tasks', async () => {
    const empty = new InMemoryFluxApi();
    vi.spyOn(empty, 'listProjectTasks').mockResolvedValue({
      content: [],
      totalElements: 0,
    });
    await create({ api: empty });
    await settle();

    expect(texts('app-empty-state p')).toEqual(['No tasks in this project.']);
  });

  it('shows an error state whose Retry loads again', async () => {
    const failing = new InMemoryFluxApi();
    const listProjectTasks = vi
      .spyOn(failing, 'listProjectTasks')
      .mockRejectedValue(new ApiError(0));
    await create({ api: failing });
    await settle();

    expect(texts('app-error-state p')[0]).toContain("Couldn't reach Flux");

    listProjectTasks.mockRestore();
    element().querySelector<HTMLElement>('app-error-state ion-button')!.click();
    await settle();

    expect(element().querySelector('app-error-state')).toBeNull();
    expect(headers()[0]).toBe('Backlog 1');
  });

  it('retries the project list when that is what failed', async () => {
    const failing = new InMemoryFluxApi();
    const listMyProjects = vi
      .spyOn(failing, 'listMyProjects')
      .mockRejectedValue(new ApiError(500));
    await create({ api: failing });
    await settle();
    expect(texts('app-error-state p')[0]).toContain('Something went wrong');

    listMyProjects.mockRestore();
    element().querySelector<HTMLElement>('app-error-state ion-button')!.click();
    await settle();

    expect(texts('.project-name')).toEqual(['Checkout']);
  });

  describe('create', () => {
    /** Taps the create button; resolves with what it opened the sheet with. */
    async function openCreate(): Promise<CreateTaskOptions> {
      element()
        .querySelector<HTMLElement>('app-create-task-fab ion-fab-button')!
        .click();
      await settle();
      return launcher.open.mock.calls[0][0] as CreateTaskOptions;
    }

    it('opens the create sheet on the open project, offering EDITOR+ ones', async () => {
      const mixed = new InMemoryFluxApi();
      vi.spyOn(mixed, 'listMyProjects').mockResolvedValue({
        content: [
          { project: { id: 'p1', name: 'Checkout' }, role: 'EDITOR' },
          { project: { id: 'p3', name: 'Ops' }, role: 'VIEWER' },
        ],
      });
      await create({ api: mixed });
      await settle();

      const options = await openCreate();

      expect(options.projectId).toBe('p1');
      expect(options.projects.map((p) => p.project?.id)).toEqual(['p1']);
    });

    it('has no create button for a viewer', async () => {
      const viewer = new InMemoryFluxApi();
      vi.spyOn(viewer, 'listMyProjects').mockResolvedValue({
        content: [{ project: { id: 'p1', name: 'Checkout' }, role: 'VIEWER' }],
      });
      await create({ api: viewer });
      await settle();

      expect(element().querySelector('app-create-task-fab')).toBeNull();
    });

    it('puts a task created here at the top of its group', async () => {
      await create();
      await settle();
      const options = await openCreate();

      options.created(await api.createTask('p1', { title: 'New one' }));
      await settle();

      expect(headers()).toContain('To Do 2');
      expect(texts('app-project-task-row .key')).toContain('CHK-161');
      const todo = texts('app-project-task-row .key');
      expect(todo.indexOf('CHK-161')).toBeLessThan(todo.indexOf('CHK-150'));
    });

    it('leaves out a created task the filters or the project rule out', async () => {
      await create();
      await settle();
      await applyFilters({ priorities: ['HIGH'] });
      const options = await openCreate();

      options.created(await api.createTask('p1', { title: 'Medium one' }));
      options.created(
        await api.createTask('p2', { title: 'Elsewhere', priority: 'HIGH' })
      );
      await settle();

      expect(texts('app-project-task-row .key')).not.toContain('CHK-161');
      expect(texts('app-project-task-row .key')).not.toContain('BIL-91');
    });
  });

  describe('swipe actions', () => {
    /** The sliding row of the task keyed `key`. */
    function sliding(key: string): HTMLIonItemSlidingElement {
      return Array.from(
        element().querySelectorAll<HTMLIonItemSlidingElement>(
          'ion-item-sliding'
        )
      ).find((s) => s.querySelector('.key')?.textContent === key)!;
    }

    function option(key: string, kind: 'archive' | 'more' | 'next') {
      return sliding(key).querySelector<HTMLElement>(`ion-item-option.${kind}`);
    }

    function sheet() {
      return fixture.componentInstance as unknown as {
        sheetOpen(): boolean;
        sheetExpand(): string | undefined;
        sheetTask(): { taskKey?: string } | undefined;
      };
    }

    /** The options of the last toast offering Undo. */
    const undoToast = () =>
      toast.create.mock.calls
        .map(([options]) => options)
        .filter((o) => o.buttons?.[0]?.text === 'Undo')
        .at(-1);

    it('offers the next status from the workflow, and More', async () => {
      await create();
      await settle();

      expect(option('CHK-131', 'next')?.textContent?.trim()).toBe('To Do');
      expect(option('CHK-150', 'next')?.textContent?.trim()).toBe(
        'In Progress'
      );
      expect(option('CHK-150', 'next')?.getAttribute('expandable')).toBe(
        'true'
      );
      expect(option('CHK-150', 'more')?.textContent?.trim()).toBe('More');
      expect(sliding('CHK-150').disabled).toBe(false);
    });

    it('moves a row to its next status group at once', async () => {
      await create();
      await settle();

      option('CHK-150', 'next')!.click();
      fixture.detectChanges();

      expect(headers()).toEqual(['Backlog 1', 'In Progress 2', 'Done 1']);
      await settle();
      expect((await api.getTask('p1', '2')).status).toBe('in_progress');
      expect(undoToast()).toMatchObject({
        message: 'Moved to In Progress',
        duration: 4000,
        positionAnchor: 'tab-bar',
      });
    });

    it('moves on a full swipe', async () => {
      await create();
      await settle();

      sliding('CHK-150')
        .querySelector('ion-item-options[side="end"]')!
        .dispatchEvent(new CustomEvent('ionSwipe'));
      await settle();

      expect((await api.getTask('p1', '2')).status).toBe('in_progress');
    });

    it('undoes a move, back into the old group', async () => {
      await create();
      await settle();
      option('CHK-150', 'next')!.click();
      await settle();

      undoToast().buttons[0].handler();
      await settle();

      expect(headers()).toEqual([
        'Backlog 1',
        'To Do 1',
        'In Progress 1',
        'Done 1',
      ]);
    });

    it('puts the row back and shows the server’s message when refused', async () => {
      await create();
      await settle();
      vi.spyOn(api, 'changeTaskStatus').mockRejectedValue(
        new ApiError(400, { message: 'Not allowed here' })
      );

      option('CHK-150', 'next')!.click();
      await settle();

      expect(headers()).toEqual([
        'Backlog 1',
        'To Do 1',
        'In Progress 1',
        'Done 1',
      ]);
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Not allowed here' })
      );
    });

    it('opens the sheet to pick a resolution when the next status is closed', async () => {
      await create();
      await settle();

      expect(option('CHK-142', 'next')?.textContent?.trim()).toBe('Done');
      option('CHK-142', 'next')!.click();

      expect(sheet().sheetOpen()).toBe(true);
      expect(sheet().sheetTask()?.taskKey).toBe('CHK-142');
      expect(sheet().sheetExpand()).toBe('done');
    });

    it('opens the status sheet from More', async () => {
      await create();
      await settle();

      option('CHK-131', 'more')!.click();

      expect(sheet().sheetOpen()).toBe(true);
      expect(sheet().sheetTask()?.taskKey).toBe('CHK-131');
      expect(sheet().sheetExpand()).toBeUndefined();
    });

    it('offers Archive for done tasks only', async () => {
      await create();
      await settle();

      expect(option('CHK-120', 'archive')).not.toBeNull();
      expect(option('CHK-150', 'archive')).toBeNull();
    });

    it('archives a done task and its subtasks, with Undo', async () => {
      const withDone = new InMemoryFluxApi();
      // The epic's subtasks must be done too.
      await withDone.changeTaskStatus('p1', '1', {
        status: 'done',
        resolution: 'done',
      });
      await withDone.changeTaskStatus('p1', '4', {
        status: 'done',
        resolution: 'done',
      });
      await create({ api: withDone });
      await settle();
      expect(headers()).toEqual(['To Do 1', 'Done 3']);

      option('CHK-120', 'archive')!.click();
      fixture.detectChanges();
      // The server archives the epic's subtasks with it.
      expect(headers()).toEqual(['To Do 1']);
      await settle();
      expect(undoToast().message).toBe('Archived CHK-120');

      undoToast().buttons[0].handler();
      // Unarchiving, then fetching the task again.
      await settle();
      await settle();
      expect(headers()).toEqual(['To Do 1', 'Done 3']);
    });

    it('puts an archived row back when the server refuses', async () => {
      await create();
      await settle();

      option('CHK-120', 'archive')!.click();
      await settle();

      expect(headers()).toContain('Done 1');
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'Only done tasks whose subtasks are all done can be archived',
        })
      );
    });

    it('drops a moved row the status filter no longer matches', async () => {
      await create();
      await settle();
      page().chooseGroupBy('priority');
      await settle();
      await applyFilters({ statuses: ['todo'] });
      expect(texts('app-project-task-row .key')).toEqual(['CHK-150']);

      option('CHK-150', 'next')!.click();
      await settle();

      expect(texts('app-project-task-row .key')).toEqual([]);
    });

    it('can’t swipe without the role to change status', async () => {
      const viewer = new InMemoryFluxApi();
      vi.spyOn(viewer, 'listMyProjects').mockResolvedValue({
        content: [{ project: { id: 'p1', name: 'Checkout' }, role: 'VIEWER' }],
      });
      await create({ api: viewer });
      await settle();

      expect(sliding('CHK-150').disabled).toBe(true);
      expect(option('CHK-120', 'archive')).toBeNull();
    });

    it('moves a row changed on task detail', async () => {
      await create();
      await settle();
      const changed = await api.changeTaskStatus('p1', '2', {
        status: 'in_progress',
      });

      TestBed.inject(TaskChangesService).report({
        ...(await api.getTask('p1', '2')),
        ...{ status: changed.status },
      });
      await settle();

      expect(headers()).toEqual(['Backlog 1', 'In Progress 2', 'Done 1']);
    });

    it('drops a row archived or deleted on task detail', async () => {
      await create();
      await settle();
      const changes = TestBed.inject(TaskChangesService);

      changes.report({ ...(await api.getTask('p1', '2')), isArchived: true });
      await settle();
      expect(texts('app-project-task-row .key')).not.toContain('CHK-150');

      changes.report(await api.getTask('p1', '1'), true);
      await settle();
      expect(texts('app-project-task-row .key')).not.toContain('CHK-142');
    });
  });
  describe('board', () => {
    const boardApi = () =>
      new InMemoryFluxApi().setTaskViewSettings('p1', { viewMode: 'board' });

    function board() {
      return fixture.componentInstance as unknown as {
        pages(): PagerState;
        orderedStatuses(): WorkflowStatus[];
        chooseView(view: 'list' | 'board'): void;
        dropped(drop: {
          task: Task;
          status: WorkflowStatus;
          index: number | undefined;
        }): void;
        sheetMoved(
          task: Task,
          choice: { status: WorkflowStatus; resolution?: string }
        ): void;
        filterOpen(): boolean;
        sheetOpen(): boolean;
        sheetExpand(): string | undefined;
      };
    }

    /** Each column as `name: KEY, KEY`. */
    function columns(): string[] {
      return Array.from(element().querySelectorAll('section.column')).map(
        (c) =>
          `${c.querySelector('.name')?.textContent}: ${Array.from(
            c.querySelectorAll('app-board-card .key')
          )
            .map((k) => k.textContent)
            .join(', ')}`
      );
    }

    function task(key: string): Task {
      return board()
        .pages()
        .columns.flatMap((c) => c.tasks)
        .find((t) => t.taskKey === key)!;
    }

    function status(slug: string): WorkflowStatus {
      return board()
        .orderedStatuses()
        .find((s) => s.slug === slug)!;
    }

    function boardComponent(): TaskBoardComponent {
      return fixture.debugElement.query(By.directive(TaskBoardComponent))
        .componentInstance as TaskBoardComponent;
    }

    /** In Progress: CHK-142, then `count` more (CHK-1000…), in that order. */
    function inProgressApi(count: number): InMemoryFluxApi {
      return boardApi().addProjectTasks('p1', count, 'in_progress');
    }

    it('shows the list by default, with the List/Board segment', async () => {
      await create();
      await settle();

      expect(
        element().querySelector<HTMLIonSegmentElement>('ion-segment')?.value
      ).toBe('list');
      expect(element().querySelector('app-task-board')).toBeNull();
      expect(headers()).toContain('To Do 1');
    });

    it("opens on the board from the project's override", async () => {
      await create({ api: boardApi() });
      await settle();

      expect(columns()).toEqual([
        'Backlog: CHK-131',
        'To Do: CHK-150',
        'In Progress: CHK-142',
        'Done: CHK-120',
      ]);
      expect(element().querySelector('ion-list')).toBeNull();
      expect(element().querySelector('.strip')).toBeNull();
      expect(element().querySelector('app-create-task-fab')).toBeNull();
      expect(texts('.project-subline')).toEqual(['Board · drag to move']);
    });

    it("falls back to the account's default view", async () => {
      await create({ defaultView: 'board' });
      await settle();

      expect(element().querySelector('app-task-board')).not.toBeNull();
    });

    it('switches to the board and saves it as the override', async () => {
      await create();
      await settle();
      const save = vi.spyOn(api, 'updateTaskViewSettings');

      board().chooseView('board');
      await settle();

      expect(save).toHaveBeenCalledWith('p1', { viewMode: 'board' });
      expect(columns()).toHaveLength(4);
    });

    it("drops the list's strip and button as soon as Board is chosen", async () => {
      await create();
      await settle();

      board().chooseView('board');
      fixture.detectChanges();

      expect(element().querySelector('.strip')).toBeNull();
      expect(element().querySelector('app-create-task-fab')).toBeNull();
      expect(element().querySelector('app-task-board')).not.toBeNull();
    });

    it('keeps the board when saving it fails', async () => {
      await create();
      await settle();
      vi.spyOn(api, 'updateTaskViewSettings').mockRejectedValue(
        new ApiError(0)
      );
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      board().chooseView('board');
      await settle();

      expect(columns()).toHaveLength(4);
    });

    it('has status columns while the list is grouped by priority', async () => {
      await create({
        api: new InMemoryFluxApi().setTaskViewSettings('p1', {
          viewMode: 'board',
          groupBy: 'priority',
        }),
      });
      await settle();

      expect(texts('section.column .name')).toEqual([
        'Backlog',
        'To Do',
        'In Progress',
        'Done',
      ]);
    });

    it('opens the filter sheet from the header, and narrows the columns', async () => {
      await create({ api: boardApi() });
      await settle();

      element().querySelector<HTMLElement>('.icon-button.filters')!.click();
      expect(board().filterOpen()).toBe(true);
      await applyFilters({ statuses: ['todo', 'done'] });

      expect(texts('section.column .name')).toEqual(['To Do', 'Done']);
      expect(element().querySelector('.filters-dot')).not.toBeNull();
    });

    it('moves a dropped card to its column, with Undo', async () => {
      await create({ api: boardApi() });
      await settle();

      board().dropped({
        task: task('CHK-150'),
        status: status('in_progress'),
        index: undefined,
      });
      await settle();

      // No drop point (a filter is set): where its position puts it.
      expect(columns()).toContain('In Progress: CHK-142, CHK-150');
      expect(columns()).toContain('To Do: ');
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Moved to In Progress' })
      );
    });

    it('asks for a resolution before a drop on a closed status', async () => {
      await create({ api: boardApi() });
      await settle();
      const change = vi.spyOn(api, 'changeTaskStatus');

      board().dropped({
        task: task('CHK-142'),
        status: status('done'),
        index: undefined,
      });

      expect(board().sheetOpen()).toBe(true);
      expect(board().sheetExpand()).toBe('done');
      expect(change).not.toHaveBeenCalled();
    });

    it('moves a card that task detail changed', async () => {
      await create({ api: boardApi() });
      await settle();

      TestBed.inject(TaskChangesService).report({
        ...task('CHK-150'),
        status: 'in_progress',
        statusCategory: 'IN_PROGRESS',
      });
      await settle();

      expect(columns()).toContain('In Progress: CHK-142, CHK-150');
    });

    describe('order', () => {
      it('loads every column whole, 100 a request, in board order', async () => {
        const api = inProgressApi(120);
        const extras = Array.from(
          { length: 120 },
          (_, i) => `p1-extra-in_progress-${i}`
        );
        await api.reorderTasks('p1', { taskIds: ['1', ...extras.reverse()] });
        const list = vi.spyOn(api, 'listProjectTasks');
        await create({ api });
        await settle();
        await vi.waitFor(() => {
          fixture.detectChanges();
          expect(
            element().querySelectorAll(
              'section[data-column="in_progress"] app-board-card'
            )
          ).toHaveLength(121);
        });

        expect(list).toHaveBeenCalledWith(
          'p1',
          expect.objectContaining({
            status: 'in_progress',
            page: 1,
            size: 100,
            sort: 'createdAt,desc',
          })
        );
        expect(
          texts('section[data-column="in_progress"] .key').slice(0, 3)
        ).toEqual(['CHK-142', 'CHK-1119', 'CHK-1118']);
      });

      it('shows skeletons until a column is whole, and Retry if it fails', async () => {
        const api = inProgressApi(120);
        const listTasks = api.listProjectTasks.bind(api);
        const list = vi
          .spyOn(api, 'listProjectTasks')
          .mockImplementation((projectId, query) =>
            query?.page === 1
              ? Promise.reject(new ApiError(0))
              : listTasks(projectId, query)
          );
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await create({ api });
        await settle();
        const column = () =>
          element().querySelector('section[data-column="in_progress"]')!;
        await vi.waitFor(() => {
          fixture.detectChanges();
          expect(column().querySelector('.more-error')).not.toBeNull();
        });
        expect(column().querySelector('app-board-card')).toBeNull();

        list.mockImplementation(listTasks);
        column().querySelector<HTMLElement>('.more-error ion-button')!.click();
        fixture.detectChanges();
        expect(column().querySelectorAll('.skeleton-card')).toHaveLength(3);
        await vi.waitFor(() => {
          fixture.detectChanges();
          expect(column().querySelectorAll('app-board-card')).toHaveLength(121);
        });
      });

      it('saves a card moved within its column', async () => {
        await create({ api: inProgressApi(2) });
        await settle();
        const save = vi.spyOn(api, 'reorderTasks');

        board().dropped({
          task: task('CHK-142'),
          status: status('in_progress'),
          index: 2,
        });
        await settle();

        expect(columns()).toContain('In Progress: CHK-1000, CHK-1001, CHK-142');
        expect(save).toHaveBeenCalledWith('p1', {
          taskIds: ['p1-extra-in_progress-0', 'p1-extra-in_progress-1', '1'],
        });
        expect((await api.getTask('p1', '1')).position).toBe(2);
      });

      it("puts the old order back with the server's message if the save fails", async () => {
        await create({ api: inProgressApi(2) });
        await settle();
        vi.spyOn(api, 'reorderTasks').mockRejectedValue(
          new ApiError(422, {
            code: 'TASK_REORDER_MIXED_STATUS',
            message: 'All tasks must be in the same status',
          })
        );

        board().dropped({
          task: task('CHK-1001'),
          status: status('in_progress'),
          index: 0,
        });
        fixture.detectChanges();
        expect(columns()).toContain('In Progress: CHK-1001, CHK-142, CHK-1000');
        await settle();

        expect(columns()).toContain('In Progress: CHK-142, CHK-1000, CHK-1001');
        expect(toast.create).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'All tasks must be in the same status',
          })
        );
      });

      it('lands a card dropped on another column where it was let go, then saves that column', async () => {
        await create({ api: inProgressApi(1) });
        await settle();
        const save = vi.spyOn(api, 'reorderTasks');

        board().dropped({
          task: task('CHK-150'),
          status: status('in_progress'),
          index: 1,
        });
        fixture.detectChanges();
        expect(columns()).toContain('In Progress: CHK-142, CHK-150, CHK-1000');

        await vi.waitFor(() =>
          expect(save).toHaveBeenCalledWith('p1', {
            taskIds: ['1', '2', 'p1-extra-in_progress-0'],
          })
        );
        expect((await api.getTask('p1', '2')).status).toBe('in_progress');
        await settle();
        expect(columns()).toContain('In Progress: CHK-142, CHK-150, CHK-1000');
      });

      it("doesn't save the order when the status change is refused", async () => {
        await create({ api: inProgressApi(1) });
        await settle();
        vi.spyOn(api, 'changeTaskStatus').mockRejectedValue(new ApiError(400));
        const save = vi.spyOn(api, 'reorderTasks');

        board().dropped({
          task: task('CHK-150'),
          status: status('in_progress'),
          index: 0,
        });
        await settle();

        expect(columns()).toContain('To Do: CHK-150');
        expect(save).not.toHaveBeenCalled();
      });

      it('queues a drop on another column offline, without saving the order', async () => {
        await create({ api: inProgressApi(1) });
        await settle();
        online.set(false);
        const send = vi.spyOn(api, 'changeTaskStatus');
        const save = vi.spyOn(api, 'reorderTasks');

        board().dropped({
          task: task('CHK-150'),
          status: status('in_progress'),
          index: 1,
        });
        await settle();

        expect(send).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
        expect(columns()).toContain('In Progress: CHK-142, CHK-150, CHK-1000');
        expect(TestBed.inject(WriteQueueService).items()[0]).toMatchObject({
          to: { slug: 'in_progress' },
        });
        const card = Array.from(
          element().querySelectorAll('app-board-card')
        ).find((c) => c.querySelector('.key')?.textContent === 'CHK-150');
        expect(card?.querySelector('.sync')).not.toBeNull();
      });

      it('says reordering needs a connection offline, and keeps the order', async () => {
        await create({ api: inProgressApi(2) });
        await settle();
        online.set(false);

        board().dropped({
          task: task('CHK-142'),
          status: status('in_progress'),
          index: 2,
        });
        await settle();

        expect(columns()).toContain('In Progress: CHK-142, CHK-1000, CHK-1001');
        expect(toast.create).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Reordering needs a connection.',
          })
        );
      });

      it('lands a card on a closed status at the drop point once resolved', async () => {
        await create({ api: boardApi() });
        await settle();
        const save = vi.spyOn(api, 'reorderTasks');

        board().dropped({
          task: task('CHK-142'),
          status: status('done'),
          index: 0,
        });
        board().sheetMoved(task('CHK-142'), {
          status: status('done'),
          resolution: 'done',
        });

        await vi.waitFor(() =>
          expect(save).toHaveBeenCalledWith('p1', { taskIds: ['1', '6'] })
        );
        await settle();
        expect(columns()).toContain('Done: CHK-142, CHK-120');
      });

      it('turns reordering off while filters are set', async () => {
        await create({ api: boardApi() });
        await settle();
        expect(boardComponent().canReorder()).toBe(true);

        await applyFilters({ priorities: ['MEDIUM', 'CRITICAL'] });

        expect(boardComponent().canReorder()).toBe(false);
        expect(boardComponent().canMove()).toBe(true);
      });
    });

    describe('Add task', () => {
      async function addTo(slug: string): Promise<CreateTaskOptions> {
        const column = element().querySelector(
          `section[data-column="${slug}"]`
        )!;
        column.querySelector<HTMLElement>('.add')!.click();
        await settle();
        return launcher.open.mock.calls.at(-1)![0] as CreateTaskOptions;
      }

      it('opens the create sheet with the column, then moves the task there', async () => {
        await create({ api: boardApi() });
        await settle();
        const options = await addTo('in_progress');
        expect(options.status?.slug).toBe('in_progress');

        const save = vi.spyOn(api, 'reorderTasks');
        const created = await api.createTask('p1', { title: 'New one' });
        options.created(created);
        await vi.waitFor(() =>
          expect(save).toHaveBeenCalledWith('p1', {
            taskIds: ['1', created.id],
          })
        );
        await settle();

        // Last, as the server puts a new task.
        expect(columns()).toContain('In Progress: CHK-142, CHK-161');
        // Quietly: the created toast is the one showing.
        expect(toast.create).not.toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Moved to In Progress' })
        );
      });

      it("leaves a type the column can't use where it started", async () => {
        await create({ api: boardApi() });
        await settle();
        const change = vi.spyOn(api, 'changeTaskStatus');
        const options = await addTo('backlog');

        options.created(await api.createTask('p1', { title: 'A task' }));
        await settle();

        expect(change).not.toHaveBeenCalled();
        expect(columns()).toContain('To Do: CHK-150, CHK-161');
      });

      it('has no Add task on a closed column', async () => {
        await create({ api: boardApi() });
        await settle();

        expect(
          element().querySelector('section[data-column="done"] .add')
        ).toBeNull();
      });
    });
  });

  describe('calendar', () => {
    // A fixed day, so the fixtures' dates sit in a known month: CHK-142 is
    // due 12 Oct, CHK-150 13 Oct, and CHK-160 (an AI candidate) has none.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 13, 9, 0));
    });

    afterEach(() => vi.useRealTimers());

    const calendarApi = () =>
      new InMemoryFluxApi().setTaskViewSettings('p1', {
        viewMode: 'calendar',
      });

    function calendar() {
      return fixture.debugElement.query(By.directive(TaskCalendarComponent))
        ?.componentInstance as
        | {
            drop(pickup: Pickup, key: string | undefined): void;
            rows(): { items: Task[] };
          }
        | undefined;
    }

    function page() {
      return fixture.componentInstance as unknown as {
        chooseView(view: 'list' | 'board' | 'calendar'): void;
        filters: { set(filters: TaskFilters): void };
      };
    }

    const keysOn = (iso: string) =>
      texts(`app-task-calendar .day[data-column="${iso}"] .pill`);

    it("opens on the calendar from the project's override", async () => {
      await create({ api: calendarApi() });
      await settle();

      expect(
        element().querySelector<HTMLIonSegmentElement>('ion-segment')?.value
      ).toBe('calendar');
      expect(keysOn('2026-10-12')).toEqual(['CHK-142']);
      expect(keysOn('2026-10-13')).toEqual(['CHK-150']);
      expect(element().querySelector('.strip')).toBeNull();
      expect(element().querySelector('app-create-task-fab')).toBeNull();
      expect(element().querySelector('.icon-button.filters')).not.toBeNull();
      expect(texts('.project-subline')).toEqual(['Calendar · October 2026']);
    });

    it('switches to the calendar and saves it as the override', async () => {
      await create();
      await settle();
      const save = vi.spyOn(api, 'updateTaskViewSettings');

      page().chooseView('calendar');
      await settle();

      expect(save).toHaveBeenCalledWith('p1', { viewMode: 'calendar' });
      expect(keysOn('2026-10-13')).toEqual(['CHK-150']);
    });

    it("keeps the project's AI filter and applies the filters", async () => {
      await create({ api: calendarApi() });
      await settle();
      expect(calendar()?.rows().items).toEqual([]);

      page().filters.set({
        statuses: [],
        priorities: ['CRITICAL'],
        assigneeIds: [],
      });
      await settle();

      expect(keysOn('2026-10-12')).toEqual(['CHK-142']);
      expect(keysOn('2026-10-13')).toEqual([]);
    });

    it('keeps labels, versions and every other field through a drag', async () => {
      await create({ api: calendarApi() });
      await settle();
      const before = await api.getTask('p1', '1');

      calendar()!.drop({ taskId: '1', columnKey: '2026-10-12' }, '2026-10-20');
      await vi.waitFor(async () =>
        expect((await api.getTask('p1', '1')).dueDate).toBe('2026-10-20')
      );
      await settle();

      expect(keysOn('2026-10-20')).toEqual(['CHK-142']);
      const after = await api.getTask('p1', '1');
      for (const field of [
        'labels',
        'environment',
        'affectedVersion',
        'fixVersion',
        'bugOccurredAt',
        'affectedUser',
        'plannedStartDate',
        'plannedEndDate',
        'title',
        'description',
        'type',
        'priority',
      ] as const) {
        expect(after[field], field).toEqual(before[field]);
      }
      expect(after.labels).toHaveLength(3);
      expect(after.fixVersion).toBe('v2.4.0');
    });

    it('ignores a drop back on the drawer', async () => {
      await create({ api: calendarApi() });
      await settle();
      const update = vi.spyOn(api, 'updateTask');

      calendar()!.drop({ taskId: '1', columnKey: '2026-10-12' }, UNSCHEDULED);
      await settle();

      expect(update).not.toHaveBeenCalled();
    });
  });
});
