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
import type {
  MyProject,
  ProjectMember,
  ProjectTasksQuery,
  Task,
  WorkflowStatus,
} from '@core/api';
import {
  BOARD_PAGE_SIZE,
  boardIndex,
  boardOrder,
  movedOrder,
} from '@core/board';
import { monthOf, monthTitle } from '@core/calendar';
import { localIsoDate } from '@core/my-work';
import { can } from '@core/permissions';
import {
  DEFAULT_SORT,
  type GroupBy,
  GroupedTaskPager,
  type PagerState,
  type ViewMode,
  aiFilterQuery,
  initialProject,
  projectInitials,
  projectSubline,
  resolveGroupBy,
  resolveViewMode,
  statusHue,
  taskGroupKey,
  taskGroups,
} from '@core/project-list';
import {
  EMPTY_FILTERS,
  type TaskFilters,
  activeFilterCount,
  assigneeOptions,
  filterQuery,
  filteredGroups,
} from '@core/task-filters';
import { dropAction, nextStatus, workflowOrder } from '@core/task-status';
import type { ChipOption } from '../../shared/option-chips/option-chips.component';
import { AuthService } from '../../auth/auth.service';
import { BoardOrderService } from '../../board/board-order.service';
import {
  type BoardColumn,
  type BoardDrop,
  TaskBoardComponent,
} from '../../board/task-board/task-board.component';
import { TaskCalendarComponent } from '../../calendar/task-calendar/task-calendar.component';
import { OfflineBannerComponent } from '../../offline/offline-banner/offline-banner.component';
import { MyProjectsService } from '../../projects/my-projects.service';
import { groupHueColors, projectTint } from '../../projects/project-colors';
import { ProjectPrefsService } from '../../projects/project-prefs.service';
import { ProjectSwitcherComponent } from '../../projects/project-switcher/project-switcher.component';
import { statusChipOptions } from '../../projects/status-options';
import { TaskFilterSheetComponent } from '../../projects/task-filter-sheet/task-filter-sheet.component';
import { ViewOptionsSheetComponent } from '../../projects/view-options-sheet/view-options-sheet.component';
import { ViewSegmentComponent } from '../../projects/view-segment/view-segment.component';
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
 * The loaded view (list, board or calendar), how the list is grouped (the
 * board is always by status), the filter sheet's status chips, the
 * workflow in order (for the swipe actions, the board's columns, the
 * calendar's pills and the status sheet), and the project's AI filter.
 */
type ListView = {
  projectId: string;
  view: ViewMode;
  groupBy: GroupBy;
  statusOptions: ChipOption[];
  statuses: WorkflowStatus[];
  aiQuery: ProjectTasksQuery;
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
 * archives a done task. The List/Board segment switches to the board (3c),
 * saved as the project's `viewMode` override like the group-by; there a
 * card dragged to another column changes its status, and one dropped in a
 * column (with no filters set) saves that column's order. The calendar (3d)
 * shows the month's tasks by date, and a task dragged to another day
 * moves its dates.
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
    OfflineBannerComponent,
    ProjectSwitcherComponent,
    ProjectTaskRowComponent,
    SkeletonRowsComponent,
    StatusSheetComponent,
    TaskBoardComponent,
    TaskCalendarComponent,
    TaskFilterSheetComponent,
    ViewOptionsSheetComponent,
    ViewSegmentComponent,
  ],
})
export class ProjectTasksPage {
  private readonly api = inject(FLUX_API);
  private readonly myProjects = inject(MyProjectsService);
  private readonly account = inject(AuthService).account;
  private readonly statusChanges = inject(TaskStatusService);
  private readonly orders = inject(BoardOrderService);
  private readonly taskChanges = inject(TaskChangesService);
  protected readonly prefs = inject(ProjectPrefsService);
  private readonly creates = inject(CreateTaskLauncherService);
  private readonly nav = inject(NavController);
  private readonly route = inject(ActivatedRoute);
  private readonly content = viewChild.required(IonContent);
  private readonly board = viewChild(TaskBoardComponent);
  private readonly calendar = viewChild(TaskCalendarComponent);

  /** The local day. Read again on refresh, so due dates roll over. */
  protected readonly today = signal(localIsoDate(new Date()));
  /** The calendar's month, kept for the session across projects. */
  protected readonly calendarMonth = signal(monthOf(this.today()));

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
          subline:
            this.view() === 'calendar'
              ? `Calendar · ${monthTitle(this.calendarMonth())}`
              : this.view() === 'board' && can(current.role, 'changeStatus')
                ? 'Board · drag to move'
                : projectSubline(current),
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
  /** A view picked here, kept like `groupByChoice`. */
  private readonly viewChoice = linkedSignal<string | null, ViewMode | null>({
    source: this.currentId,
    computation: () => null,
  });

  /** Each project's workflow statuses, fetched once per session. */
  private readonly statuses = new Map<string, Promise<WorkflowStatus[]>>();
  /** Each project's assignable members, fetched once per session. */
  private readonly members = new Map<string, Promise<ProjectMember[]>>();
  private readonly pager = new GroupedTaskPager(this.api);
  protected readonly pages = signal<PagerState>({
    groups: [],
    done: true,
    columns: [],
  });

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
            viewChoice: this.viewChoice(),
          }
        : undefined;
    },
    loader: async ({ params, abortSignal }): Promise<ListView> => {
      const { projectId, filters, sort, groupByChoice, viewChoice } = params;
      const [statuses, settings] = await Promise.all([
        this.workflowStatuses(projectId),
        this.api.getTaskViewSettings(projectId),
      ]);
      abortSignal.throwIfAborted();
      const groupBy =
        groupByChoice ??
        resolveGroupBy(settings.groupBy, this.account()?.defaultGroupBy);
      const view =
        viewChoice ??
        resolveViewMode(settings.viewMode, this.account()?.defaultView);
      const grouping = view === 'board' ? 'status' : groupBy;
      const categoryPositions = this.current()?.project?.categoryPositions;
      const filtered = filteredGroups(
        grouping,
        taskGroups(grouping, statuses, categoryPositions),
        filters
      );
      const aiQuery = aiFilterQuery(settings.aiTaskFilter);
      const query = { ...aiQuery, ...filtered.query };
      this.columnsFailed.set(new Set());
      if (view === 'board') {
        // Every column whole, in board order, which the server can't sort
        // by: newest first breaks ties in position.
        await this.pager.start(
          projectId,
          filtered.groups,
          { ...query, sort: DEFAULT_SORT },
          { size: BOARD_PAGE_SIZE, order: boardOrder }
        );
        for (const column of this.pager.state.columns) {
          if (!column.complete) {
            void this.loadColumn(column.group.key);
          }
        }
      } else if (view === 'list') {
        await this.pager.start(projectId, filtered.groups, { ...query, sort });
      }
      // The calendar loads its own tasks, by date.
      return {
        projectId,
        view,
        groupBy,
        statusOptions: statusChipOptions(statuses, categoryPositions),
        statuses: workflowOrder(statuses, categoryPositions),
        aiQuery,
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
  protected readonly view = computed<ViewMode>(
    () => this.listValue()?.view ?? 'list'
  );
  /**
   * The view being loaded, or the one shown once it has: a choice made, or
   * the last. The chrome follows it, so switching doesn't show the list's
   * strip over the board's skeleton.
   */
  protected readonly pendingView = computed(
    () => this.viewChoice() ?? this.listValue()?.view ?? 'list'
  );
  /** How the loaded rows are grouped: the board's columns are statuses. */
  private readonly grouping = computed<GroupBy>(() =>
    this.view() === 'board' ? 'status' : this.groupBy()
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
  /**
   * Board cards can be placed within a column: not while filters are set,
   * since a column then holds only some of its tasks, and the server
   * renumbers only the ones it's sent.
   */
  protected readonly canReorder = computed(
    () => this.canMove() && this.filterCount() === 0
  );
  protected readonly canArchive = computed(() =>
    can(this.current()?.role, 'archive')
  );
  /** The create button shows for an EDITOR+ in the open project. */
  protected readonly canCreate = computed(() =>
    can(this.current()?.role, 'create')
  );
  /**
   * Only the list has a create button: each board column has Add task, and
   * the calendar has none.
   */
  protected readonly showFab = computed(
    () => this.canCreate() && this.pendingView() === 'list'
  );
  /** The calendar's query: the filters, with the project's AI filter. */
  protected readonly calendarQuery = computed<ProjectTasksQuery | undefined>(
    () => {
      const loaded = this.listValue();
      return loaded?.projectId === this.currentId()
        ? { ...loaded?.aiQuery, ...filterQuery(this.filters()) }
        : undefined;
    }
  );
  /** Calendar drags change dates, which needs an EDITOR+. */
  protected readonly canEdit = computed(() =>
    can(this.current()?.role, 'edit')
  );
  /** The board's columns: every status group, empty ones included. */
  protected readonly boardColumns = computed<BoardColumn[]>(() => {
    const statuses = new Map(this.orderedStatuses().map((s) => [s.slug, s]));
    return this.pages().columns.flatMap((loaded) => {
      const status = statuses.get(loaded.group.key);
      return status ? [{ status, loaded }] : [];
    });
  });
  protected readonly empty = computed(() =>
    this.view() === 'board'
      ? this.boardColumns().length === 0
      : this.pages().groups.length === 0
  );
  /**
   * The next page failed to load. Infinite scroll stops until Retry, so the
   * failure is said in words rather than by a spinner that just stops.
   */
  protected readonly moreFailed = signal(false);
  protected readonly retryingMore = signal(false);
  /** Board columns whose loading failed, which show Retry. */
  protected readonly columnsFailed = signal<ReadonlySet<string>>(new Set());

  protected readonly switcherOpen = signal(false);
  protected readonly filterOpen = signal(false);
  protected readonly viewOpen = signal(false);

  /** The status sheet: the row it was opened for, kept while it closes. */
  protected readonly sheetOpen = signal(false);
  protected readonly sheetTask = signal<Task | undefined>(undefined);
  protected readonly sheetExpand = signal<string | undefined>(undefined);
  /** A board card dropped on a closed status: where it was let go. */
  private sheetDrop: { status: string; index: number } | undefined;
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

  /**
   * The board or calendar holds a task, or a touch started in a scrolled
   * board column.
   */
  protected readonly refreshBlocked = signal(false);

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
      if (
        refresher &&
        !this.projects.isLoading() &&
        !this.list.isLoading() &&
        !this.calendar()?.loading()
      ) {
        void refresher.complete();
        this.refresher.set(undefined);
      }
    });
  }

  /**
   * Ionic keeps the page under task detail (and behind other tabs), where
   * the calendar's drawer and day sheet, presented over everything, mustn't
   * stay.
   */
  ionViewWillEnter(): void {
    this.calendar()?.enter();
  }

  ionViewWillLeave(): void {
    this.calendar()?.leave();
  }

  protected choose(project: MyProject): void {
    this.switcherOpen.set(false);
    const id = project.project?.id;
    if (id && id !== this.currentId()) {
      this.currentId.set(id);
      void this.content().scrollToTop(0);
    }
  }

  /**
   * Opens the create sheet (3i) on the open project; from a board column
   * (`status`), each task created is then moved to that column.
   */
  protected openCreate(status?: WorkflowStatus): void {
    const projectId = this.currentId();
    if (!projectId) {
      return;
    }
    void this.creates.open({
      projects: this.projectList().filter((p) => can(p.role, 'create')),
      projectId,
      status,
      created: (task) => {
        this.created(task);
        if (status) {
          void this.moveCreated(task, status);
        }
      },
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

  /**
   * Switches List/Board/Calendar, and saves the choice as the project's
   * override.
   */
  protected chooseView(view: ViewMode): void {
    const projectId = this.currentId();
    if (!projectId || view === this.view()) {
      return;
    }
    this.viewChoice.set(view);
    this.refreshBlocked.set(false);
    void this.content().scrollToTop(0);
    // Like the group-by, the view doesn't wait for the save.
    this.api
      .updateTaskViewSettings(projectId, { viewMode: view })
      .catch((error: unknown) =>
        console.error('Saving the view failed', error)
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

  /**
   * Moves a task to the status chosen. On the board, `index` is where it
   * was let go in that column, whose order is saved once the move is.
   */
  protected async move(
    task: Task,
    choice: StatusChoice,
    index?: number
  ): Promise<void> {
    this.sheetOpen.set(false);
    const id = task.id ?? '';
    if (this.busy.has(id)) {
      return;
    }
    this.busy.add(id);
    try {
      await this.moveTo(task, choice.status, choice.resolution, index, true);
    } finally {
      this.busy.delete(id);
    }
  }

  /** The status sheet's choice: at the drop point if it's the column dropped on. */
  protected sheetMoved(task: Task, choice: StatusChoice): void {
    const drop = this.sheetDrop;
    void this.move(
      task,
      choice,
      drop && drop.status === choice.status.slug ? drop.index : undefined
    );
  }

  /**
   * A card dropped on the board: within its column, the new order; on
   * another, the move, or the status sheet with the resolution picker open
   * for a closed status. (The board has already refused a column the task's
   * type can't use, and an order that doesn't change.)
   */
  protected dropped({ task, status, index }: BoardDrop): void {
    switch (dropAction(task, status)) {
      case 'same':
        if (index !== undefined) {
          void impact('medium');
          void this.reorder(task, status.slug ?? '', index);
        }
        break;
      case 'move':
        void impact('medium');
        void this.move(task, { status }, index);
        break;
      case 'resolution':
        void impact('medium');
        this.openSheet(task, status.slug, index);
        break;
    }
  }

  /** Loads a whole board column; a failure shows its Retry. */
  protected async loadColumn(key: string): Promise<void> {
    this.setColumnFailed(key, false);
    try {
      await this.pager.loadAllIn(key);
    } catch (error) {
      console.error('Loading a board column failed', error);
      this.setColumnFailed(key, true);
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
    this.calendar()?.reload();
    // Set after the reloads start, so the effect sees them loading.
    this.refresher.set(event.target);
  }

  /** A pull started: a card press can't become a drag. */
  protected refreshStarted(): void {
    this.board()?.cancelPress();
    this.calendar()?.cancelPress();
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

  /** `index`: where a board card dropped on a closed status was let go. */
  private openSheet(task: Task, expand?: string, index?: number): void {
    this.sheetDrop =
      expand !== undefined && index !== undefined
        ? { status: expand, index }
        : undefined;
    this.sheetTask.set(task);
    this.sheetExpand.set(expand);
    this.sheetOpen.set(true);
  }

  /**
   * Shows a changed task in the group it now belongs to, or drops it when
   * the status filter no longer matches. (With status groups the filter has
   * already narrowed the groups, so the pager drops it anyway.) A row
   * moving group goes to `index`; without one, to the top of a list group,
   * or where the board order puts it in a column.
   */
  private place(task: Task, index?: number): void {
    const statuses = this.filters().statuses;
    const matches = !statuses.length || statuses.includes(task.status ?? '');
    const key = matches ? taskGroupKey(this.grouping(), task) : undefined;
    const column = this.pages().columns.find((c) => c.group.key === key);
    this.pager.placeTask(
      task,
      key,
      index ??
        (this.view() === 'board' && column ? boardIndex(column.tasks, task) : 0)
    );
  }

  /**
   * Moves `task` to `status`, showing it at `index` in that board column
   * (a refusal puts it back where the board order puts it), then saves the
   * column's order, since a status change keeps the task's old position.
   */
  private async moveTo(
    task: Task,
    status: WorkflowStatus,
    resolution: string | undefined,
    index: number | undefined,
    undoable: boolean
  ): Promise<void> {
    const key = status.slug ?? '';
    const moved = await this.statusChanges.move(
      task,
      status,
      resolution,
      {
        apply: (t) => this.place(t, t.status === key ? index : undefined),
        anchor: TAB_BAR,
      },
      undoable
    );
    if (moved && index !== undefined) {
      const previous = boardOrder(this.columnTasks(key)).map((t) => t.id ?? '');
      await this.saveOrder(task.projectId ?? '', key, previous);
    }
  }

  /** Puts a card at `index` in its own column, and saves the column's order. */
  private async reorder(task: Task, key: string, index: number): Promise<void> {
    const id = task.id ?? '';
    if (this.busy.has(id)) {
      return;
    }
    this.busy.add(id);
    const previous = this.columnTasks(key).map((t) => t.id ?? '');
    this.pager.reorder(key, movedOrder(previous, id, index));
    try {
      await this.saveOrder(task.projectId ?? '', key, previous);
    } finally {
      this.busy.delete(id);
    }
  }

  /** Saves a board column's order as shown; a refusal puts `previous` back. */
  private async saveOrder(
    projectId: string,
    key: string,
    previous: string[]
  ): Promise<void> {
    const taskIds = this.columnTasks(key).map((t) => t.id ?? '');
    if (taskIds.length) {
      await this.orders.save(projectId, taskIds, {
        restore: () => this.pager.reorder(key, previous),
        anchor: TAB_BAR,
      });
    }
  }

  private columnTasks(key: string): readonly Task[] {
    return this.pages().columns.find((c) => c.group.key === key)?.tasks ?? [];
  }

  /**
   * Moves a task created from a board column there, quietly: the created
   * toast is already showing. On the board it goes last, as the server
   * puts a new task, and the column's order is saved. A type the column
   * can't use stays where it started (the sheet's callout said so).
   */
  private async moveCreated(task: Task, status: WorkflowStatus): Promise<void> {
    if (
      task.projectId !== this.currentId() ||
      dropAction(task, status) !== 'move'
    ) {
      return;
    }
    const column = this.pages().columns.find(
      (c) => c.group.key === status.slug
    );
    const last =
      this.view() === 'board' && this.canReorder() && column?.complete
        ? column.tasks.length
        : undefined;
    await this.moveTo(task, status, undefined, last, false);
  }

  private setColumnFailed(key: string, failed: boolean): void {
    const next = new Set(this.columnsFailed());
    if (failed) {
      next.add(key);
    } else {
      next.delete(key);
    }
    this.columnsFailed.set(next);
  }

  /**
   * Shows a task just created in this project at the top of its group, if
   * the filters let it in. (The default sort is newest first; under another
   * one it sits at the top until the list reloads.) On the board it goes
   * last in its column, where its position puts it.
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
