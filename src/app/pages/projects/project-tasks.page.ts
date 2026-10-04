import {
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItemDivider,
  IonItemGroup,
  IonList,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonToolbar,
  type InfiniteScrollCustomEvent,
  type RefresherCustomEvent,
} from '@ionic/angular';
import type { MyProject, WorkflowStatus } from '@core/api';
import { localIsoDate } from '@core/my-work';
import {
  type GroupBy,
  type GroupHue,
  GroupedTaskPager,
  type PagerState,
  aiFilterQuery,
  initialProject,
  projectInitials,
  projectSubline,
  resolveGroupBy,
  taskGroups,
} from '@core/project-list';
import { AuthService } from '../../auth/auth.service';
import { projectTint } from '../../projects/project-colors';
import { ProjectPrefsService } from '../../projects/project-prefs.service';
import { ProjectSwitcherComponent } from '../../projects/project-switcher/project-switcher.component';
import { FLUX_API } from '../../providers/flux-api.token';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { ProjectTaskRowComponent } from '../../shared/project-task-row/project-task-row.component';
import { SkeletonRowsComponent } from '../../shared/skeleton-rows/skeleton-rows.component';

/** The server's page cap: more projects than this aren't listed. */
const PROJECTS_PAGE_SIZE = 100;

/** A group header's dot (9), word (11) and wash for each hue. */
const HUE_COLORS: Record<GroupHue, [dot: string, text: string, wash: string]> =
  {
    gray: ['n8', 'na11', 'na2'],
    blue: ['blue9', 'blue11', 'bluea3'],
    amber: ['amber9', 'amber11', 'ambera2'],
    green: ['green9', 'green11', 'greena2'],
    purple: ['purple9', 'purple11', 'purplea3'],
    cyan: ['cyan9', 'cyan11', 'cyana3'],
    red: ['red9', 'red11', 'reda3'],
  };

const GROUP_BY_LABELS: Record<GroupBy, string> = {
  none: 'Not grouped',
  status: 'Grouped by status',
  priority: 'Grouped by priority',
  type: 'Grouped by type',
};

/**
 * Projects tab (handoff 3b): one project's tasks, grouped under sticky
 * headers and paged as you scroll. The header opens the switcher (3j); the
 * project open last is remembered.
 */
@Component({
  selector: 'app-project-tasks',
  templateUrl: './project-tasks.page.html',
  styleUrls: ['./project-tasks.page.scss'],
  imports: [
    IonButton,
    IonHeader,
    IonToolbar,
    IonContent,
    IonIcon,
    IonList,
    IonItemGroup,
    IonItemDivider,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonModal,
    IonRefresher,
    IonRefresherContent,
    EmptyStateComponent,
    ErrorStateComponent,
    ProjectSwitcherComponent,
    ProjectTaskRowComponent,
    SkeletonRowsComponent,
  ],
})
export class ProjectTasksPage {
  private readonly api = inject(FLUX_API);
  private readonly account = inject(AuthService).account;
  protected readonly prefs = inject(ProjectPrefsService);
  private readonly content = viewChild.required(IonContent);

  /** The local day. Read again on refresh, so due dates roll over. */
  protected readonly today = signal(localIsoDate(new Date()));

  /** The user's projects, and which one to open first. */
  protected readonly projects = resource({
    loader: async () => {
      const [page, lastId] = await Promise.all([
        this.api.listMyProjects({
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          size: PROJECTS_PAGE_SIZE,
        }),
        this.prefs.lastProjectId(),
        this.prefs.load(),
      ]);
      const projects = page.content ?? [];
      return {
        projects,
        initialId:
          initialProject(projects, lastId, this.prefs.pinned())?.project?.id ??
          null,
      };
    },
  });
  /** The last successful load (`value()` throws while in error). */
  private readonly loaded = computed(() =>
    this.projects.hasValue() ? this.projects.value() : undefined
  );
  protected readonly projectList = computed<readonly MyProject[]>(
    () => this.loaded()?.projects ?? []
  );

  /** The open project's id: kept across a refresh while it's still listed. */
  protected readonly currentId = linkedSignal({
    source: this.loaded,
    computation: (loaded, previous): string | null =>
      previous?.value &&
      loaded?.projects.some((p) => p.project?.id === previous.value)
        ? previous.value
        : (loaded?.initialId ?? null),
  });
  protected readonly current = computed(() =>
    this.projectList().find((p) => p.project?.id === this.currentId())
  );

  protected readonly title = computed(() => {
    const current = this.current();
    return current
      ? {
          name: current.project?.name ?? '',
          initials: projectInitials(current.project),
          subline: projectSubline(current),
          colors: projectTint(current.project?.id ?? ''),
        }
      : undefined;
  });

  /** Each project's workflow statuses, fetched once per session. */
  private readonly statuses = new Map<string, Promise<WorkflowStatus[]>>();
  private readonly pager = new GroupedTaskPager(this.api);
  protected readonly pages = signal<PagerState>({ groups: [], done: true });

  /** Loads the open project's settings and the first page of each group. */
  protected readonly list = resource({
    params: () => this.currentId() ?? undefined,
    loader: async ({ params: projectId, abortSignal }) => {
      const [statuses, settings] = await Promise.all([
        this.workflowStatuses(projectId),
        this.api.getTaskViewSettings(projectId),
      ]);
      abortSignal.throwIfAborted();
      const groupBy = resolveGroupBy(
        settings.groupBy,
        this.account()?.defaultGroupBy
      );
      const groups = taskGroups(
        groupBy,
        statuses,
        this.current()?.project?.categoryPositions
      );
      await this.pager.start(
        projectId,
        groups,
        aiFilterQuery(settings.aiTaskFilter)
      );
      return { groupBy };
    },
  });
  protected readonly groupByLabel = computed(() =>
    this.list.hasValue() ? GROUP_BY_LABELS[this.list.value().groupBy] : ''
  );
  protected readonly empty = computed(() => this.pages().groups.length === 0);
  /**
   * The next page failed to load. Infinite scroll stops until Retry, so the
   * failure is said in words rather than by a spinner that just stops.
   */
  protected readonly moreFailed = signal(false);
  protected readonly retryingMore = signal(false);

  protected readonly switcherOpen = signal(false);

  /** The pull-to-refresh in progress, completed once its reloads settle. */
  private readonly refresher = signal<
    RefresherCustomEvent['target'] | undefined
  >(undefined);

  constructor() {
    this.pager.onChange((state) => {
      this.pages.set(state);
      this.moreFailed.set(false);
    });

    effect(() => {
      const id = this.currentId();
      if (id) {
        void this.prefs.setLastProject(id);
      }
    });

    effect(() => {
      const refresher = this.refresher();
      if (refresher && !this.projects.isLoading() && !this.list.isLoading()) {
        void refresher.complete();
        this.refresher.set(undefined);
      }
    });
  }

  protected hueColors(hue: GroupHue): Record<string, string> {
    const [dot, text, wash] = HUE_COLORS[hue];
    return {
      '--group-dot': `var(--flux-${dot})`,
      '--group-text': `var(--flux-${text})`,
      '--group-wash': `var(--flux-${wash})`,
    };
  }

  protected choose(project: MyProject): void {
    this.switcherOpen.set(false);
    const id = project.project?.id;
    if (id && id !== this.currentId()) {
      this.currentId.set(id);
      void this.content().scrollToTop(0);
    }
  }

  protected togglePin(projectId: string): void {
    void this.prefs.togglePin(projectId);
  }

  protected loadMore(event: InfiniteScrollCustomEvent): void {
    void this.nextPage().finally(() => void event.target.complete());
  }

  /** Tries the page that failed again. */
  protected retryMore(): void {
    this.retryingMore.set(true);
    void this.nextPage().finally(() => this.retryingMore.set(false));
  }

  /** Reloads the projects (their counts) and the open project's list. */
  protected refresh(event: RefresherCustomEvent): void {
    this.today.set(localIsoDate(new Date()));
    this.projects.reload();
    this.list.reload();
    // Set after the reloads start, so the effect sees them loading.
    this.refresher.set(event.target);
  }

  protected retry(): void {
    if (this.projects.error()) {
      this.projects.reload();
    } else {
      this.list.reload();
    }
  }

  /** Loads the next page; a failure shows the Retry row. Never rejects. */
  private async nextPage(): Promise<void> {
    try {
      await this.pager.loadMore();
    } catch (error) {
      console.error('Loading more tasks failed', error);
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
