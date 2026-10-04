import type { SearchbarCustomEvent } from '@ionic/angular';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FluxApi } from '@core/api';
import type { MyTaskFilters } from '@core/task-filters';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import type { ChipOption } from '../../shared/option-chips/option-chips.component';
import { FLUX_API } from '../../providers/flux-api.token';
import { SEARCH_DEBOUNCE_MS } from '../../shared/debounced';
import { MyWorkSearchPage } from './my-work-search.page';

describe('MyWorkSearchPage', () => {
  let fixture: ComponentFixture<MyWorkSearchPage>;
  let api: InMemoryFluxApi;

  async function create() {
    api = new InMemoryFluxApi();
    await TestBed.configureTestingModule({
      imports: [MyWorkSearchPage],
      providers: [
        provideRouter([]),
        { provide: FLUX_API, useValue: api as FluxApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyWorkSearchPage);
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

  /** Types, then waits out the debounce and the search. */
  async function search(value: string): Promise<void> {
    element()
      .querySelector('ion-searchbar')!
      .dispatchEvent(
        new CustomEvent('ionInput', {
          detail: { value },
        }) as SearchbarCustomEvent
      );
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

  /** The page's protected sheet handlers, as the sheet calls them. */
  function page() {
    return fixture.componentInstance as unknown as {
      filterDraft: { set(filters: MyTaskFilters): void };
      openFilters(): void;
      filtersClosed(): void;
      statusOptions: { hasValue(): boolean; value(): ChipOption[] };
    };
  }

  async function applyFilters(filters: Partial<MyTaskFilters>) {
    page().openFilters();
    page().filterDraft.set({ statuses: [], priorities: [], ...filters });
    page().filtersClosed();
    await settle();
  }

  it('asks for a search or a filter, with no badge on Filters', async () => {
    await create();
    await settle();

    expect(texts('app-empty-state p')).toEqual([
      'Search your tasks in every project by key or title.',
    ]);
    expect(texts('app-filter-button')).toEqual(['Filters']);
  });

  it('searches my assigned tasks in every project, done ones included', async () => {
    await create();
    const listMyTasks = vi.spyOn(api, 'listMyTasks');

    await search('saved');

    expect(listMyTasks).toHaveBeenCalledWith({
      scope: 'assigned',
      openOnly: false,
      search: 'saved',
      projectId: undefined,
      status: undefined,
      priority: undefined,
      page: 0,
      size: 50,
    });
    expect(texts('app-task-row .title')).toEqual(['Migrate saved cards']);
  });

  it('lists by filters alone, before anything is typed', async () => {
    await create();
    await settle();

    await applyFilters({ priorities: ['CRITICAL', 'LOW'] });

    expect(texts('app-filter-button ion-badge')).toEqual(['1']);
    expect(texts('app-task-row .title')).toEqual([
      'Fix 3DS redirect on Safari',
      'Speed up the order summary query',
    ]);
  });

  it("filters by a project and that project's statuses", async () => {
    await create();
    await settle();
    const listMyTasks = vi.spyOn(api, 'listMyTasks');

    page().openFilters();
    page().filterDraft.set({
      projectId: 'p1',
      statuses: [],
      priorities: [],
    });
    await settle();
    expect(
      page()
        .statusOptions.value()
        .map((o) => o.label)
    ).toEqual(['Backlog', 'To Do', 'In Progress', 'Done']);

    page().filterDraft.set({
      projectId: 'p1',
      statuses: ['todo', 'done'],
      priorities: [],
    });
    page().filtersClosed();
    await settle();

    expect(listMyTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: 'p1', status: 'todo,done' })
    );
    expect(texts('app-filter-button ion-badge')).toEqual(['2']);
    expect(texts('app-task-row .title')).toEqual([
      'Migrate saved cards',
      'Review pull request #482',
    ]);
  });

  it('says when nothing matches the filters, and Clear filters keeps the search', async () => {
    await create();
    await search('docs');
    expect(texts('app-task-row .title')).toEqual(['Write invoice export docs']);

    await applyFilters({ priorities: ['HIGH'] });
    expect(texts('app-empty-state p')).toEqual([
      'No tasks match these filters',
    ]);

    element().querySelector<HTMLElement>('.clear-filters')!.click();
    await settle();
    expect(texts('app-task-row .title')).toEqual(['Write invoice export docs']);
  });

  it('says so when a search alone matches nothing', async () => {
    await create();
    await search('zzz');

    expect(texts('app-empty-state p')).toEqual(['No tasks match “zzz”']);
    expect(element().querySelector('.clear-filters')).toBeNull();
  });
});
