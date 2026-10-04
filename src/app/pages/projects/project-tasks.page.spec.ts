import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FluxApi, MyProject } from '@core/api';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { AuthService } from '../../auth/auth.service';
import { ProjectPrefsService } from '../../projects/project-prefs.service';
import { FLUX_API } from '../../providers/flux-api.token';
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

  async function create(
    options: {
      api?: FluxApi;
      prefs?: ReturnType<typeof fakePrefs>;
      defaultGroupBy?: string;
    } = {}
  ) {
    api = options.api ?? new InMemoryFluxApi();
    prefs = options.prefs ?? fakePrefs();
    await TestBed.configureTestingModule({
      imports: [ProjectTasksPage],
      providers: [
        provideRouter([]),
        { provide: FLUX_API, useValue: api },
        { provide: ProjectPrefsService, useValue: prefs },
        {
          provide: AuthService,
          useValue: {
            account: signal({
              id: 'a1',
              defaultGroupBy: options.defaultGroupBy,
            }),
          },
        },
      ],
    }).compileComponents();

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

    expect(texts('.strip')).toEqual(['Grouped by status']);
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

    expect(texts('.strip')).toEqual(['Grouped by priority']);
    expect(headers()).toEqual(['Critical 1', 'Medium 2', 'Low 1']);
  });

  it("falls back to the account's default, here ungrouped", async () => {
    await create({ defaultGroupBy: 'none' });
    await settle();

    expect(element().querySelector('.strip')).toBeNull();
    expect(element().querySelector('ion-item-divider')).toBeNull();
    expect(texts('app-project-task-row .key')).toHaveLength(4);
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
});
