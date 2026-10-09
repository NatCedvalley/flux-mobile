import {
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItemDivider,
  IonItemGroup,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonList,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonToolbar,
  NavController,
  type InfiniteScrollCustomEvent,
  type ItemSlidingCustomEvent,
  type RefresherCustomEvent,
} from '@ionic/angular';
import type { MyProject, ProjectMember, Task, WorkflowStatus } from '@core/api';
import { localIsoDate } from '@core/my-work';
import { can } from '@core/permissions';
import {
  DEFAULT_SORT,
  type GroupBy,
  GroupedTaskPager,
  type PagerState,
  aiFilterQuery,
  initialProject,
  projectInitials,
  projectSubline,
  resolveGroupBy,
  statusHue,
  taskGroupKey,
  taskGroups,
} from '@core/project-list';
import {
  EMPTY_FILTERS,
  type TaskFilters,
  activeFilterCount,
  assigneeOptions,
  filteredGroups,
} from '@core/task-filters';
import { nextStatus, workflowOrder } from '@core/task-status';
import type { ChipOption } from '../../shared/option-chips/option-chips.component';
import { AuthService } from '../../auth/auth.service';
import { MyProjectsService } from '../../projects/my-projects.service';
import { groupHueColors, projectTint } from '../../projects/project-colors';
import { ProjectPrefsService } from '../../projects/project-prefs.service';
import { ProjectSwitcherComponent } from '../../projects/project-switcher/project-switcher.component';
import { statusChipOptions } from '../../projects/status-options';
import { TaskFilterSheetComponent } from '../../projects/task-filter-sheet/task-filter-sheet.component';
import { ViewOptionsSheetComponent } from '../../projects/view-options-sheet/view-options-sheet.component';
import { FLUX_API } from '../../providers/flux-api.token';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { FilterButtonComponent } from '../../shared/filter-button/filter-button.component';
import { ProjectTaskRowComponent } from '../../shared/project-task-row/project-task-row.component';
import { SkeletonRowsComponent } from '../../shared/skeleton-rows/skeleton-rows.component';
import { CreateTaskFabComponent } from '../../task-create/create-task-fab/create-task-fab.component';
import { CreateTaskLauncherService } from '../../task-create/create-task-launcher.service';
import { impact } from '../../task-status/haptics';
import {
  type StatusChoice,
  StatusSheetComponent,
} from '../../task-status/status-sheet/status-sheet.component';
import { TaskChangesService } from '../../task-status/task-changes.service';
import { TaskStatusService } from '../../task-status/task-status.service';

const GROUP_BY_LABELS: Record<GroupBy, string> = {
  none: 'Not grouped',
  status: 'Grouped by status',
  priority: 'Grouped by priority',
  type: 'Grouped by type',
};

/**
 * How the loaded list is grouped, the filter sheet's status chips, and the
 * workflow in order (for the swipe actions and the status sheet).
 */
type ListView = {
  groupBy: GroupBy;
  statusOptions: ChipOption[];
  statuses: WorkflowStatus[];
};

/** The tab bar's id: toasts sit above it. */
const TAB_BAR = 'tab-bar';

/**
 * Projects tab (handoff 3b): one project's tasks, grouped under sticky
 * headers and paged as you scroll. The header opens the switcher (3j); the
 * project open last is remembered. The strip under it opens the view
 * options (group-by, saved as the project's override as on the web, and
 * sort, kept for the session) and the filters (kept until the project
 * changes). For an EDITOR+, rows swipe: the end side moves the task to its
 * next status (or opens the status sheet from More), the start side
 * archives a done task.
 */
@Component({
  selector: 'app-project-tasks',
  templateUrl: './project-tasks.page.html',
  styleUrls: ['./project-tasks.page.scss'],
  imports: [
    RouterLink,
    IonButton,
    IonButtons,
    IonHeader,
    IonToolbar,
    IonContent,
    IonIcon,
    IonList,
    IonItemGroup,
    IonItemDivider,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonModal,
    IonRefresher,
    IonRefresherContent,
    CreateTaskFabComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    FilterButtonComponent,
    ProjectSwitcherComponent,
    ProjectTaskRowComponent,
    SkeletonRowsComponent,
    StatusSheetComponent,
    TaskFilterSheetComponent,
    ViewOptionsSheetComponent,
  ],
})
export class ProjectTasksPage {
  private readonly api = inject(FLUX_API);
  private readonly myProjects = inject(MyProjectsService);
  private readonly account = inject(AuthService).account;
  private readonly statusChanges = inject(TaskStatusService);
  private readonly taskChanges = inject(TaskChangesService);
  protected readonly prefs = inject(ProjectPrefsService);
  private readonly creates = inject(CreateTaskLauncherService);
  private readonly nav = inject(NavController);
  private readonly route = inject(ActivatedRoute);
  private readonly content = viewChild.required(IonContent);

  /** The local day. Read again on refresh, so due dates roll over. */
  protected readonly today = signal(localIsoDate(new Date()));

  /** The user's projects, and which one to open first. */
  protected readonly projects = resource({
    loader: async () => {
      const [projects, lastId] = await Promise.all([
        this.myProjects.load(),
        this.prefs.lastProjectId(),
        this.prefs.load(),
      ]);
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

  /** The filters in use: none again whenever the project changes. */
  protected readonly filters = linkedSignal<string | null, TaskFilters>({
    source: this.currentId,
    computation: () => EMPTY_FILTERS,
  });
  /** The filter sheet's edits, applied when it closes. */
  protected readonly filterDraft = signal<TaskFilters>(EMPTY_FILTERS);
  protected readonly filterCount = computed(() =>
    activeFilterCount(this.filters())
  );
  /** The sort, kept for the session across projects, as on the web. */
  protected readonly sort = signal(DEFAULT_SORT);
  /**
   * A group-by picked here. It wins over the saved settings (whose save may
   * still be in flight) until the project changes.
   */
  private readonly groupByChoice = linkedSignal<string | null, GroupBy | null>({
    source: this.currentId,
    computation: () => null,
  });

  /** Each project's workflow statuses, fetched once per session. */
  private readonly statuses = new Map<string, Promise<WorkflowStatus[]>>();
  /** Each project's assignable members, fetched once per session. */
  private readonly members = new Map<string, Promise<ProjectMember[]>>();
  private readonly pager = new GroupedTaskPager(this.api);
  protected readonly pages = signal<PagerState>({ groups: [], done: true });

  /** Loads the open project's settings and the first page of each group. */
  protected readonly list = resource({
    params: () => {
      const projectId = this.currentId();
      return projectId
        ? {
            projectId,
            filters: this.filters(),
            sort: this.sort(),
            groupByChoice: this.groupByChoice(),
          }
        : undefined;
    },
    loader: async ({ params, abortSignal }): Promise<ListView> => {
      const { projectId, filters, sort, groupByChoice } = params;
      const [statuses, settings] = await Promise.all([
        this.workflowStatuses(projectId),
        this.api.getTaskViewSettings(projectId),
      ]);
      abortSignal.throwIfAborted();
      const groupBy =
        groupByChoice ??
        resolveGroupBy(settings.groupBy, this.account()?.defaultGroupBy);
      const categoryPositions = this.current()?.project?.categoryPositions;
      const filtered = filteredGroups(
        groupBy,
        taskGroups(groupBy, statuses, categoryPositions),
        filters
      );
      await this.pager.start(projectId, filtered.groups, {
        ...aiFilterQuery(settings.aiTaskFilter),
        ...filtered.query,
        sort,
      });
      return {
        groupBy,
        statusOptions: statusChipOptions(statuses, categoryPositions),
        statuses: workflowOrder(statuses, categoryPositions),
      };
    },
  });
  /**
   * The last loaded list's settings, kept while the next one loads so the
   * strip doesn't flicker (`value()` throws while in error).
   */
  protected readonly listValue = linkedSignal<
    ListView | undefined,
    ListView | undefined
  >({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
  protected readonly groupBy = computed<GroupBy>(
    () => this.listValue()?.groupBy ?? 'status'
  );
  protected readonly groupByLabel = computed(
    () => GROUP_BY_LABELS[this.groupBy()]
  );
  protected readonly statusOptions = computed(
    () => this.listValue()?.statusOptions ?? []
  );
  protected readonly orderedStatuses = computed(
    () => this.listValue()?.statuses ?? []
  );
  /** Rows swipe for an EDITOR+ only (archiving needs the same role). */
  protected readonly canMove = computed(() =>
    can(this.current()?.role, 'changeStatus')
  );
  protected readonly canArchive = computed(() =>
    can(this.current()?.role, 'archive')
  );
  /** The create button shows for an EDITOR+ in the open project. */
  protected readonly canCreate = computed(() =>
    can(this.current()?.role, 'create')
  );
  protected readonly empty = computed(() => this.pages().groups.length === 0);
  /**
   * The next page failed to load. Infinite scroll stops until Retry, so the
   * failure is said in words rather than by a spinner that just stops.
   */
  protected readonly moreFailed = signal(false);
  protected readonly retryingMore = signal(false);

  protected readonly switcherOpen = signal(false);
  protected readonly filterOpen = signal(false);
  protected readonly viewOpen = signal(false);

  /** The status sheet: the row it was opened for, kept while it closes. */
  protected readonly sheetOpen = signal(false);
  protected readonly sheetTask = signal<Task | undefined>(undefined);
  protected readonly sheetExpand = signal<string | undefined>(undefined);
  /** Rows with a change on its way, which don't take another. */
  private readonly busy = new Set<string>();
  /** The row whose swipe actions are fully showing (one light haptic). */
  private revealed: EventTarget | null = null;

  /** The filter sheet's assignee rows, loaded the first time it opens. */
  private readonly membersWanted = signal(false);
  protected readonly assignees = resource({
    params: () =>
      this.membersWanted() ? (this.currentId() ?? undefined) : undefined,
    loader: async ({ params: projectId }) =>
      assigneeOptions(
        await this.assignableMembers(projectId),
        this.account()?.id
      ),
  });

  protected readonly hueColors = groupHueColors;

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

    // A task changed elsewhere (task detail) moves here too, and leaves
    // when it was archived or deleted.
    effect(() => {
      const change = this.taskChanges.changed();
      untracked(() => {
        const task = change?.task;
        if (
          task?.id &&
          task.projectId === this.currentId() &&
          this.pager.has(task.id)
        ) {
          if (change?.removed || task.isArchived) {
            this.pager.placeTask(task, undefined);
          } else {
            this.place(task);
          }
        }
      });
    });

    effect(() => {
      const refresher = this.refresher();
      if (refresher && !this.projects.isLoading() && !this.list.isLoading()) {
        void refresher.complete();
        this.refresher.set(undefined);
      }
    });
  }

  protected choose(project: MyProject): void {
    this.switcherOpen.set(false);
    const id = project.project?.id;
    if (id && id !== this.currentId()) {
      this.currentId.set(id);
      void this.content().scrollToTop(0);
    }
  }

  /** Opens the create sheet (3i) on the open project. */
  protected openCreate(): void {
    const projectId = this.currentId();
    if (!projectId) {
      return;
    }
    void this.creates.open({
      projects: this.projectList().filter((p) => can(p.role, 'create')),
      projectId,
      created: (task) => this.created(task),
      openTask: (task) =>
        void this.nav.navigateForward(['tasks', task.projectId, task.id], {
          relativeTo: this.route,
          state: { task },
        }),
    });
  }

  protected togglePin(projectId: string): void {
    void this.prefs.togglePin(projectId);
  }

  protected openFilters(): void {
    this.filterDraft.set(this.filters());
    this.membersWanted.set(true);
    this.filterOpen.set(true);
  }

  /** Applies the sheet's edits as it closes, however it was closed. */
  protected filtersClosed(): void {
    this.filterOpen.set(false);
    const draft = this.filterDraft();
    if (JSON.stringify(draft) !== JSON.stringify(this.filters())) {
      this.filters.set(draft);
      void this.content().scrollToTop(0);
    }
  }

  protected clearFilters(): void {
    this.filters.set(EMPTY_FILTERS);
  }

  /** Regroups the list, and saves the choice as the project's override. */
  protected chooseGroupBy(groupBy: GroupBy): void {
    const projectId = this.currentId();
    if (!projectId || groupBy === this.groupBy()) {
      return;
    }
    this.groupByChoice.set(groupBy);
    void this.content().scrollToTop(0);
    // The list doesn't wait for it: a failed save only loses the choice
    // for the next session.
    this.api
      .updateTaskViewSettings(projectId, { groupBy })
      .catch((error: unknown) =>
        console.error('Saving the group-by failed', error)
      );
  }

  protected chooseSort(sort: string): void {
    if (sort !== this.sort()) {
      this.sort.set(sort);
      void this.content().scrollToTop(0);
    }
  }

  /** The status a row's swipe moves it to; undefined at the workflow's end. */
  protected nextFor(task: Task): WorkflowStatus | undefined {
    return nextStatus(this.orderedStatuses(), task);
  }

  protected statusColors(status: WorkflowStatus): Record<string, string> {
    return groupHueColors(statusHue(status.color, status.category));
  }

  /** A light haptic once a row's swipe actions are fully showing. */
  protected dragged(event: ItemSlidingCustomEvent): void {
    const ratio = Math.abs((event.detail as { ratio: number }).ratio);
    if (ratio >= 1 && this.revealed !== event.target) {
      this.revealed = event.target;
      void impact('light');
    } else if (ratio < 1 && this.revealed === event.target) {
      this.revealed = null;
    }
  }

  /**
   * The swipe's primary action (a full swipe or a tap): moves the task to
   * its next status, or opens the sheet when that status needs a resolution.
   */
  protected moveNext(task: Task, sliding: IonItemSliding): void {
    void sliding.close();
    void impact('medium');
    const next = this.nextFor(task);
    if (!next || next.isClosed) {
      this.openSheet(task, next?.slug);
    } else {
      void this.move(task, { status: next });
    }
  }

  /** More: the status sheet for the row. */
  protected more(task: Task, sliding: IonItemSliding): void {
    void sliding.close();
    this.openSheet(task);
  }

  protected async move(task: Task, choice: StatusChoice): Promise<void> {
    this.sheetOpen.set(false);
    const id = task.id ?? '';
    if (this.busy.has(id)) {
      return;
    }
    this.busy.add(id);
    try {
      await this.statusChanges.move(task, choice.status, choice.resolution, {
        apply: (t) => this.place(t),
        anchor: TAB_BAR,
      });
    } finally {
      this.busy.delete(id);
    }
  }

  /** Archives a done task; the server archives its subtasks with it. */
  protected async archive(task: Task, sliding: IonItemSliding): Promise<void> {
    void sliding.close();
    const id = task.id ?? '';
    if (this.busy.has(id)) {
      return;
    }
    void impact('medium');
    this.busy.add(id);
    const subtasks = this.loadedSubtasks(id);
    try {
      await this.statusChanges.archive(task, {
        removed: () => {
          for (const t of [task, ...subtasks]) {
            this.pager.placeTask(t, undefined);
          }
        },
        restored: (t) => {
          for (const s of [t, ...subtasks]) {
            this.place(s);
          }
        },
        anchor: TAB_BAR,
      });
    } finally {
      this.busy.delete(id);
    }
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
    this.myProjects.invalidate();
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

  /** The listed descendants of a task, at any depth. */
  private loadedSubtasks(taskId: string): Task[] {
    const rows = this.pages().groups.flatMap((g) => g.tasks);
    const ids = new Set([taskId]);
    const found: Task[] = [];
    let added = true;
    while (added) {
      added = false;
      for (const row of rows) {
        if (
          row.parentTaskId &&
          ids.has(row.parentTaskId) &&
          !ids.has(row.id!)
        ) {
          ids.add(row.id!);
          found.push(row);
          added = true;
        }
      }
    }
    return found;
  }

  private openSheet(task: Task, expand?: string): void {
    this.sheetTask.set(task);
    this.sheetExpand.set(expand);
    this.sheetOpen.set(true);
  }

  /**
   * Shows a changed task in the group it now belongs to, or drops it when
   * the status filter no longer matches. (With status groups the filter has
   * already narrowed the groups, so the pager drops it anyway.)
   */
  private place(task: Task): void {
    const statuses = this.filters().statuses;
    const matches = !statuses.length || statuses.includes(task.status ?? '');
    this.pager.placeTask(
      task,
      matches ? taskGroupKey(this.groupBy(), task) : undefined
    );
  }

  /**
   * Shows a task just created in this project at the top of its group, if
   * the filters let it in. (The default sort is newest first; under another
   * one it sits at the top until the list reloads.)
   */
  private created(task: Task): void {
    if (task.projectId !== this.currentId() || !this.list.hasValue()) {
      return;
    }
    const { priorities, assigneeIds } = this.filters();
    const assignees = (task.assignees ?? []).map((a) => a.accountId);
    if (
      (!priorities.length || priorities.includes(task.priority ?? 'MEDIUM')) &&
      (!assigneeIds.length || assigneeIds.some((id) => assignees.includes(id)))
    ) {
      this.place(task);
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

  private assignableMembers(projectId: string): Promise<ProjectMember[]> {
    let members = this.members.get(projectId);
    if (!members) {
      members = this.api.listAssignableMembers(projectId);
      this.members.set(projectId, members);
      // A failure isn't cached, so a retry fetches again.
      members.catch(() => this.members.delete(projectId));
    }
    return members;
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
