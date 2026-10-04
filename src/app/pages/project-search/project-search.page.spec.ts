import type { SearchbarCustomEvent } from '@ionic/angular';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FluxApi } from '@core/api';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { FLUX_API } from '../../providers/flux-api.token';
import { SEARCH_DEBOUNCE_MS } from '../../shared/debounced';
import { ProjectSearchPage } from './project-search.page';

describe('ProjectSearchPage', () => {
  let fixture: ComponentFixture<ProjectSearchPage>;
  let api: InMemoryFluxApi;

  async function create(
    inputs: { project?: string; sort?: string } = { project: 'p1' },
    withApi: InMemoryFluxApi = new InMemoryFluxApi()
  ) {
    api = withApi;
    await TestBed.configureTestingModule({
      imports: [ProjectSearchPage],
      providers: [
        provideRouter([]),
        { provide: FLUX_API, useValue: api as FluxApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectSearchPage);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
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

  /** Types into the search field, as `ionInput` reports it. */
  function type(value: string): void {
    element()
      .querySelector('ion-searchbar')!
      .dispatchEvent(
        new CustomEvent('ionInput', {
          detail: { value },
        }) as SearchbarCustomEvent
      );
  }

  /** Types, then waits out the debounce and the search. */
  async function search(value: string): Promise<void> {
    type(value);
    // The debounce runs on real timers: wait until it has let the search
    // through, however busy the test runner is.
    const debouncedSearch = () =>
      (fixture.componentInstance as unknown as { search(): string }).search();
    const deadline = Date.now() + SEARCH_DEBOUNCE_MS * 10;
    while (debouncedSearch() !== value.trim() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await settle();
  }

  it('asks for a search until something is typed', async () => {
    await create();
    await settle();

    expect(texts('app-empty-state p')).toEqual([
      'Search this project’s tasks by key or title.',
    ]);
  });

  it('searches the project by title or key, with its AI filter and sort', async () => {
    await create({ project: 'p1', sort: 'dueDate,asc' });
    const listProjectTasks = vi.spyOn(api, 'listProjectTasks');

    await search('  chk-1 ');

    expect(listProjectTasks).toHaveBeenCalledWith('p1', {
      excludeLabel: 'ai:candidate',
      search: 'chk-1',
      sort: 'dueDate,asc',
      page: 0,
      size: 50,
    });
    expect(texts('app-project-task-row .key')).toEqual([
      'CHK-120',
      'CHK-142',
      'CHK-150',
      'CHK-131',
    ]);
  });

  it('sorts newest first without a sort from the list', async () => {
    await create();
    const listProjectTasks = vi.spyOn(api, 'listProjectTasks');

    await search('safari');

    expect(listProjectTasks).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ sort: 'createdAt,desc' })
    );
    expect(texts('app-project-task-row .key')).toEqual(['CHK-142']);
  });

  it('sends one search once typing pauses', async () => {
    await create();
    const listProjectTasks = vi.spyOn(api, 'listProjectTasks');

    type('s');
    type('sa');
    await search('saf');

    expect(listProjectTasks).toHaveBeenCalledTimes(1);
    expect(listProjectTasks).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ search: 'saf' })
    );
  });

  it('says so when nothing matches', async () => {
    await create();
    await search('nothing like this');

    expect(texts('app-empty-state p')).toEqual([
      'No tasks match “nothing like this”',
    ]);
  });

  it('loads more results as you scroll', async () => {
    await create(
      { project: 'p1' },
      new InMemoryFluxApi().addProjectTasks('p1', 60)
    );
    await search('extra');
    expect(element().querySelectorAll('app-project-task-row')).toHaveLength(50);

    const scroll = element().querySelector('ion-infinite-scroll')!;
    const complete = vi.fn().mockResolvedValue(undefined);
    Object.assign(scroll, { complete });
    scroll.dispatchEvent(new CustomEvent('ionInfinite'));
    await settle();

    expect(element().querySelectorAll('app-project-task-row')).toHaveLength(60);
    expect(complete).toHaveBeenCalled();
  });

  it('shows an error state whose Retry searches again', async () => {
    await create();
    const listProjectTasks = vi
      .spyOn(api, 'listProjectTasks')
      .mockRejectedValueOnce(new ApiError(0));

    await search('safari');
    expect(element().querySelector('app-error-state')).not.toBeNull();

    element().querySelector<HTMLElement>('app-error-state ion-button')!.click();
    await settle();

    expect(listProjectTasks).toHaveBeenCalledTimes(2);
    expect(texts('app-project-task-row .key')).toEqual(['CHK-142']);
  });
});
