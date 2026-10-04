import {
  Component,
  computed,
  inject,
  input,
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
  IonSearchbar,
  IonToolbar,
  type InfiniteScrollCustomEvent,
  type SearchbarCustomEvent,
} from '@ionic/angular';
import type { Task, TaskViewSettings } from '@core/api';
import { localIsoDate } from '@core/my-work';
import {
  DEFAULT_SORT,
  PROJECT_PAGE_SIZE,
  aiFilterQuery,
} from '@core/project-list';
import { PagedList, type PagedListState } from '@core/task-filters';
import { FLUX_API } from '../../providers/flux-api.token';
import { SEARCH_DEBOUNCE_MS, debounced } from '../../shared/debounced';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { ProjectTaskRowComponent } from '../../shared/project-task-row/project-task-row.component';
import { SkeletonRowsComponent } from '../../shared/skeleton-rows/skeleton-rows.component';

/**
 * Searches one project's tasks by title or key (the project list's header
 * search). The results are one flat list in the list's sort, with the
 * project's AI-candidate filter but not the list's filters.
 */
@Component({
  selector: 'app-project-search',
  templateUrl: './project-search.page.html',
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
    EmptyStateComponent,
    ErrorStateComponent,
    ProjectTaskRowComponent,
    SkeletonRowsComponent,
  ],
})
export class ProjectSearchPage {
  private readonly api = inject(FLUX_API);
  private readonly searchbar = viewChild.required(IonSearchbar);

  /** The project to search (`?project=`), bound by the router. */
  readonly project = input<string>();
  /** The project list's sort (`?sort=`). */
  readonly sort = input<string>();

  protected readonly today = signal(localIsoDate(new Date()));
  protected readonly query = signal('');
  /** The trimmed query, sent once typing pauses. */
  protected readonly search = debounced(
    computed(() => this.query().trim()),
    SEARCH_DEBOUNCE_MS
  );

  private readonly list = new PagedList<Task>(PROJECT_PAGE_SIZE);
  protected readonly rows = signal<PagedListState<Task>>(this.list.state);
  /** Each project's view settings, for its AI filter: fetched once. */
  private readonly settings = new Map<string, Promise<TaskViewSettings>>();

  protected readonly results = resource({
    params: () => {
      const projectId = this.project();
      const search = this.search();
      return projectId && search ? { projectId, search } : undefined;
    },
    loader: async ({ params: { projectId, search }, abortSignal }) => {
      const settings = await this.viewSettings(projectId);
      abortSignal.throwIfAborted();
      const query = {
        ...aiFilterQuery(settings.aiTaskFilter),
        search,
        sort: this.sort() || DEFAULT_SORT,
      };
      await this.list.start((page, size) =>
        this.api.listProjectTasks(projectId, { ...query, page, size })
      );
      return true;
    },
  });

  /** The next page failed: Retry says so instead of a stopped spinner. */
  protected readonly moreFailed = signal(false);
  protected readonly retryingMore = signal(false);

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

  private viewSettings(projectId: string): Promise<TaskViewSettings> {
    let settings = this.settings.get(projectId);
    if (!settings) {
      settings = this.api.getTaskViewSettings(projectId);
      this.settings.set(projectId, settings);
      // A failure isn't kept, so a retry fetches again.
      settings.catch(() => this.settings.delete(projectId));
    }
    return settings;
  }
}
