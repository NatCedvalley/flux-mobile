import {
  Component,
  computed,
  inject,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonList,
  IonModal,
  IonSearchbar,
  IonToolbar,
  type InfiniteScrollCustomEvent,
  type SearchbarCustomEvent,
} from '@ionic/angular';
import type { MyTask, WorkflowStatus } from '@core/api';
import { localIsoDate } from '@core/my-work';
import {
  EMPTY_MY_TASK_FILTERS,
  type MyTaskFilters,
  PagedList,
  type PagedListState,
  activeFilterCount,
  myTaskFilterQuery,
} from '@core/task-filters';
import { statusChipOptions } from '../../projects/status-options';
import { FLUX_API } from '../../providers/flux-api.token';
import { SEARCH_DEBOUNCE_MS, debounced } from '../../shared/debounced';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { FilterButtonComponent } from '../../shared/filter-button/filter-button.component';
import { SkeletonRowsComponent } from '../../shared/skeleton-rows/skeleton-rows.component';
import { TaskRowComponent } from '../../shared/task-row/task-row.component';
import { MyTaskFilterSheetComponent } from './my-task-filter-sheet.component';

/** Rows per request, as on the project list. */
const PAGE_SIZE = 50;
/** The server's page cap: more projects than this aren't listed. */
const PROJECTS_PAGE_SIZE = 100;

/**
 * Searches the user's assigned tasks across every project (My Work's
 * header search), done ones included, so any task can be found. Its own
 * Filters narrow by project, that project's statuses, and priority; with
 * filters set, results show even before anything is typed.
 */
@Component({
  selector: 'app-my-work-search',
  templateUrl: './my-work-search.page.html',
  styleUrls: ['../../shared/search-page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonSearchbar,
    IonContent,
    IonList,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonModal,
    EmptyStateComponent,
    ErrorStateComponent,
    FilterButtonComponent,
    MyTaskFilterSheetComponent,
    SkeletonRowsComponent,
    TaskRowComponent,
  ],
})
export class MyWorkSearchPage {
  private readonly api = inject(FLUX_API);
  private readonly searchbar = viewChild.required(IonSearchbar);

  protected readonly today = signal(localIsoDate(new Date()));
  protected readonly query = signal('');
  /** The trimmed query, sent once typing pauses. */
  protected readonly search = debounced(
    computed(() => this.query().trim()),
    SEARCH_DEBOUNCE_MS
  );

  protected readonly filters = signal<MyTaskFilters>(EMPTY_MY_TASK_FILTERS);
  /** The filter sheet's edits, applied when it closes. */
  protected readonly filterDraft = signal<MyTaskFilters>(EMPTY_MY_TASK_FILTERS);
  protected readonly filterCount = computed(() =>
    activeFilterCount(this.filters())
  );
  protected readonly filterOpen = signal(false);

  private readonly list = new PagedList<MyTask>(PAGE_SIZE);
  protected readonly rows = signal<PagedListState<MyTask>>(this.list.state);

  protected readonly results = resource({
    params: () => {
      const search = this.search();
      const filters = this.filters();
      return search || activeFilterCount(filters)
        ? { search, filters }
        : undefined;
    },
    loader: async ({ params: { search, filters } }) => {
      const query = {
        scope: 'assigned' as const,
        openOnly: false,
        search: search || undefined,
        ...myTaskFilterQuery(filters),
      };
      await this.list.start((page, size) =>
        this.api.listMyTasks({ ...query, page, size })
      );
      return true;
    },
  });

  /** The next page failed: Retry says so instead of a stopped spinner. */
  protected readonly moreFailed = signal(false);
  protected readonly retryingMore = signal(false);

  /** The filter sheet's projects, loaded the first time it opens. */
  private readonly optionsWanted = signal(false);
  protected readonly projects = resource({
    params: () => (this.optionsWanted() ? true : undefined),
    loader: async () =>
      (
        await this.api.listMyProjects({
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          size: PROJECTS_PAGE_SIZE,
        })
      ).content ?? [],
  });
  /** Each project's workflow statuses, fetched once per visit. */
  private readonly statuses = new Map<string, Promise<WorkflowStatus[]>>();
  /** The status chips of the project picked in the sheet. */
  protected readonly statusOptions = resource({
    params: () =>
      this.filterOpen() ? this.filterDraft().projectId : undefined,
    loader: async ({ params: projectId }) => {
      const statuses = await this.workflowStatuses(projectId);
      const project = (
        this.projects.hasValue() ? this.projects.value() : []
      ).find((p) => p.project?.id === projectId);
      return statusChipOptions(statuses, project?.project?.categoryPositions);
    },
  });

  constructor() {
    this.list.onChange((state) => {
      this.rows.set(state);
      this.moreFailed.set(false);
    });
  }

  /** Ionic's lifecycle: focus the field once the page has slid in. */
  ionViewDidEnter(): void {
    void this.searchbar().setFocus();
  }

  protected onInput(event: SearchbarCustomEvent): void {
    this.query.set(event.detail.value ?? '');
  }

  protected openFilters(): void {
    this.filterDraft.set(this.filters());
    this.optionsWanted.set(true);
    this.filterOpen.set(true);
  }

  /** Applies the sheet's edits as it closes, however it was closed. */
  protected filtersClosed(): void {
    this.filterOpen.set(false);
    const draft = this.filterDraft();
    if (JSON.stringify(draft) !== JSON.stringify(this.filters())) {
      this.filters.set(draft);
    }
  }

  /** Clears the filters, keeping what was typed. */
  protected clearFilters(): void {
    this.filters.set(EMPTY_MY_TASK_FILTERS);
  }

  protected retryOptions(): void {
    if (this.projects.error()) {
      this.projects.reload();
    }
    if (this.statusOptions.error()) {
      this.statusOptions.reload();
    }
  }

  protected loadMore(event: InfiniteScrollCustomEvent): void {
    void this.nextPage().finally(() => void event.target.complete());
  }

  protected retryMore(): void {
    this.retryingMore.set(true);
    void this.nextPage().finally(() => this.retryingMore.set(false));
  }

  private async nextPage(): Promise<void> {
    try {
      await this.list.loadMore();
    } catch (error) {
      console.error('Loading more results failed', error);
      this.moreFailed.set(true);
    }
  }

  private workflowStatuses(projectId: string): Promise<WorkflowStatus[]> {
    let statuses = this.statuses.get(projectId);
    if (!statuses) {
      statuses = this.api.listWorkflowStatuses(projectId);
      this.statuses.set(projectId, statuses);
      // A failure isn't cached, so a retry fetches again.
      statuses.catch(() => this.statuses.delete(projectId));
    }
    return statuses;
  }
}
