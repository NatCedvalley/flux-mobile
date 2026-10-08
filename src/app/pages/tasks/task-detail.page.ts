import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Clipboard } from '@capacitor/clipboard';
import {
  AlertController,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonToolbar,
  NavController,
  ToastController,
  type InfiniteScrollCustomEvent,
  type RefresherCustomEvent,
} from '@ionic/angular';
import type {
  MyTask,
  ProjectMember,
  Task,
  TaskActivity,
  TaskComment,
} from '@core/api';
import { ApiError } from '@core/auth';
import { localIsoDate } from '@core/my-work';
import { avatarFillIndex, initials } from '@core/people';
import { can } from '@core/permissions';
import { priorityFact } from '@core/project-list';
import { assigneeSummary, commentCount } from '@core/task-detail';
import { TITLE_MAX, type TaskChange, parentTypes } from '@core/task-edit';
import {
  PRIORITY_OPTIONS,
  PagedList,
  type PagedListState,
  assigneeOptions,
} from '@core/task-filters';
import { nextStatus, workflowOrder } from '@core/task-status';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { MyProjectsService } from '../../projects/my-projects.service';
import { FLUX_API } from '../../providers/flux-api.token';
import { DateSheetComponent } from '../../shared/date-sheet/date-sheet.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import {
  type PickerItem,
  PickerSheetComponent,
} from '../../shared/picker-sheet/picker-sheet.component';
import { SkeletonRowsComponent } from '../../shared/skeleton-rows/skeleton-rows.component';
import { TYPE_ICONS } from '../../shared/task-row/task-row.component';
import { TextEditSheetComponent } from '../../shared/text-edit-sheet/text-edit-sheet.component';
import { TaskEditService } from '../../task-edit/task-edit.service';
import {
  type StatusChoice,
  StatusSheetComponent,
} from '../../task-status/status-sheet/status-sheet.component';
import { TaskChangesService } from '../../task-status/task-changes.service';
import { TaskStatusService } from '../../task-status/task-status.service';
import { statusPill } from './status-pill';
import { TaskActionBarComponent } from './task-action-bar/task-action-bar.component';
import { TaskActivityComponent } from './task-activity/task-activity.component';
import { TaskCommentsComponent } from './task-comments/task-comments.component';
import { TaskDetailsSkeletonComponent } from './task-details/task-details-skeleton.component';
import { TaskDetailsComponent } from './task-details/task-details.component';
import {
  type OverflowAction,
  TaskOverflowSheetComponent,
} from './task-overflow-sheet/task-overflow-sheet.component';

export type DetailTab = 'activity' | 'comments' | 'details';

/** The field editors, each a sheet. */
type Editor =
  | 'assignees'
  | 'description'
  | 'due'
  | 'labels'
  | 'parent'
  | 'priority'
  | 'title'
  | 'type';

/** The types in the type picker, leaf types first. */
const TYPES: readonly NonNullable<Task['type']>[] = [
  'TASK',
  'BUG',
  'FEATURE',
  'IMPROVEMENT',
  'EPIC',
  'MASTER',
];

/** Parent candidates fetched per search. */
const PARENT_PAGE_SIZE = 20;

/** What a list row hands detail, to fill the header while the task loads. */
export type TaskPreview = Pick<
  MyTask,
  | 'id'
  | 'priority'
  | 'status'
  | 'statusCategory'
  | 'statusName'
  | 'taskKey'
  | 'title'
  | 'type'
>;

/** Top-level comments per page: the server's cap, so threads rarely page. */
const COMMENTS_PAGE_SIZE = 100;
const ACTIVITY_PAGE_SIZE = 50;

/** A list not loaded yet (`state` undefined), or that failed. */
type ListView<T> = {
  state: PagedListState<T> | undefined;
  error: unknown;
};

/**
 * Task detail (handoff 3e–3g): a header with the key, watch bell, title and
 * chips, then Details, Comments and Activity tabs, over a docked action bar.
 * An EDITOR+ edits the title, priority and type from the header, the due
 * date, labels and description from Details, and the rest from the overflow
 * sheet (3n), each in its own sheet; the role and archived state decide
 * what shows.
 */
@Component({
  selector: 'app-task-detail',
  templateUrl: './task-detail.page.html',
  styleUrls: ['./task-detail.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonBadge,
    IonContent,
    IonModal,
    IonRefresher,
    IonRefresherContent,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonSkeletonText,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonRowsComponent,
    TaskDetailsComponent,
    TaskDetailsSkeletonComponent,
    TaskCommentsComponent,
    TaskActivityComponent,
    StatusSheetComponent,
    TaskActionBarComponent,
    TaskOverflowSheetComponent,
    PickerSheetComponent,
    TextEditSheetComponent,
    DateSheetComponent,
  ],
})
export class TaskDetailPage {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);
  private readonly alerts = inject(AlertController);
  private readonly nav = inject(NavController);
  private readonly statusChanges = inject(TaskStatusService);
  private readonly edits = inject(TaskEditService);
  private readonly taskChanges = inject(TaskChangesService);
  private readonly myProjects = inject(MyProjectsService);
  private readonly route = inject(ActivatedRoute);
  private readonly account = inject(AuthService).account;
  protected readonly myId = computed(() => this.account()?.id);

  // Bound to the ':projectId/:taskId' route params and the route's
  // `backHref` data via withComponentInputBinding().
  readonly projectId = input.required<string>();
  readonly taskId = input.required<string>();
  /** Where back goes when there's no history, e.g. after a deep link. */
  readonly backHref = input.required<string>();

  /** The row this was opened from, if any (none after a deep link). */
  private readonly passedRow = readPassedRow(inject(Router));

  /** The local day and time, read again on refresh. */
  protected readonly now = signal(new Date());
  protected readonly today = computed(() => localIsoDate(this.now()));

  protected readonly tab = signal<DetailTab>('details');

  private readonly ids = computed(() => ({
    projectId: this.projectId(),
    taskId: this.taskId(),
  }));

  protected readonly task = resource({
    params: this.ids,
    loader: ({ params }) => this.api.getTask(params.projectId, params.taskId),
  });
  /** The project's workflow, for the status's name and colour. */
  protected readonly statuses = resource({
    params: () => this.projectId(),
    loader: ({ params }) => this.api.listWorkflowStatuses(params),
  });
  private readonly subscription = resource({
    params: this.ids,
    loader: ({ params }) =>
      this.api.getTaskSubscription(params.projectId, params.taskId),
  });
  /** A container's subtasks; nothing is fetched for other types. */
  protected readonly subtasks = resource({
    params: () => {
      const type = this.loadedTask()?.type;
      return type === 'MASTER' || type === 'EPIC' ? this.ids() : undefined;
    },
    loader: ({ params }) =>
      this.api.listChildTasks(params.projectId, params.taskId),
  });

  /** The caller's project: their role, its name and its category order. */
  private readonly project = resource({
    params: () => this.projectId(),
    loader: async ({ params }) =>
      (await this.myProjects.load()).find((p) => p.project?.id === params),
  });
  private readonly role = computed(() =>
    this.project.hasValue() ? this.project.value()?.role : undefined
  );
  /** The server refuses changes to an archived task. */
  private readonly archived = computed(() => !!this.loadedTask()?.isArchived);
  /** A VIEWER gets no docked bar, a COMMENTER only its comment button. */
  protected readonly canComment = computed(() => can(this.role(), 'comment'));
  protected readonly canMove = computed(
    () => can(this.role(), 'changeStatus') && !this.archived()
  );
  /** Field edits wait for the task, since they write over it. */
  protected readonly canEdit = computed(
    () => can(this.role(), 'edit') && !!this.loadedTask() && !this.archived()
  );
  protected readonly canReassign = computed(
    () => can(this.role(), 'reassign') && !!this.loadedTask()
  );
  protected readonly canDelete = computed(() => can(this.role(), 'delete'));
  protected readonly canArchive = computed(
    () =>
      can(this.role(), 'archive') &&
      this.loadedTask()?.statusCategory === 'DONE' &&
      !this.archived()
  );
  protected readonly projectName = computed(() =>
    this.project.hasValue() ? this.project.value()?.project?.name : undefined
  );

  /** The last successful load (`value()` throws while in error). */
  protected readonly loadedTask = computed(() =>
    this.task.hasValue() ? this.task.value() : undefined
  );
  /** The passed row, when it's this task. */
  private readonly preview = computed(() =>
    this.passedRow?.id === this.taskId() ? this.passedRow : undefined
  );
  /** The header's facts: the task once loaded, the row until then. */
  protected readonly header = computed<
    (Partial<TaskPreview> & Pick<Task, 'title'>) | undefined
  >(() => this.loadedTask() ?? this.preview());

  protected readonly typeIcon = computed(
    () => TYPE_ICONS[this.header()?.type ?? 'TASK'] ?? TYPE_ICONS.TASK
  );
  protected readonly typeLabel = computed(() => {
    const type = this.header()?.type ?? '';
    return type ? type[0] + type.slice(1).toLowerCase() : '';
  });
  protected readonly status = computed(() => {
    const header = this.header();
    return header?.status
      ? statusPill(
          header.status,
          this.statuses.hasValue() ? this.statuses.value() : [],
          header.statusCategory,
          this.preview()?.statusName
        )
      : undefined;
  });
  protected readonly priority = computed(() =>
    priorityFact(this.header()?.priority)
  );

  /** The workflow in order, for the sheet and the suggested next status. */
  protected readonly orderedStatuses = computed(() =>
    workflowOrder(
      this.statuses.hasValue() ? this.statuses.value() : [],
      this.project.hasValue()
        ? this.project.value()?.project?.categoryPositions
        : undefined
    )
  );
  /** The docked button's status, from the project's workflow. */
  protected readonly next = computed(() => {
    const task = this.loadedTask();
    return task ? nextStatus(this.orderedStatuses(), task) : undefined;
  });
  /** The status can change once the task and its workflow have loaded. */
  protected readonly statusReady = computed(
    () => !!this.loadedTask() && this.statuses.hasValue() && !this.statusBusy()
  );
  private readonly statusBusy = signal(false);
  protected readonly sheetOpen = signal(false);
  /** A closed status to open the sheet at, with its resolutions showing. */
  protected readonly sheetExpand = signal<string | undefined>(undefined);
  /** The docked bar, which toasts sit above. */
  private readonly actionBar = viewChild(TaskActionBarComponent, {
    read: ElementRef,
  });

  /** The bell: set as soon as it's tapped, put back if the server refuses. */
  protected readonly watching = linkedSignal(() =>
    this.subscription.hasValue()
      ? this.subscription.value().subscribed
      : undefined
  );
  private readonly bellBusy = signal(false);

  protected readonly titleMax = TITLE_MAX;
  protected readonly overflowOpen = signal(false);
  /** The overflow row chosen, run once its sheet has closed. */
  private overflowChoice: OverflowAction | undefined;
  protected readonly editor = signal<Editor | undefined>(undefined);
  private readonly textSheet = viewChild(TextEditSheetComponent);

  protected readonly priorityItems: PickerItem[] = PRIORITY_OPTIONS.map(
    (option) => ({
      id: option.value,
      label: option.label,
      icon: priorityFact(option.value)?.icon,
    })
  );
  protected readonly typeItems: PickerItem[] = TYPES.map((type) => ({
    id: type,
    label: type[0] + type.slice(1).toLowerCase(),
    icon: TYPE_ICONS[type],
  }));

  /** The project's labels, fetched the first time the picker opens. */
  private readonly labelsWanted = signal(false);
  protected readonly projectLabels = resource({
    params: () => (this.labelsWanted() ? this.projectId() : undefined),
    loader: ({ params }) => this.api.listLabels(params),
  });
  /** Label names are unique in a project, so they serve as the rows' ids. */
  protected readonly labelItems = computed(() =>
    this.projectLabels.hasValue()
      ? this.projectLabels
          .value()
          .filter((l) => !!l.name)
          .map((l): PickerItem => ({ id: l.name ?? '', label: l.name ?? '' }))
      : undefined
  );
  protected readonly labelDraft = signal<readonly string[]>([]);

  /** The project's members, fetched the first time Reassign opens. */
  private readonly membersWanted = signal(false);
  protected readonly members = resource({
    params: () => (this.membersWanted() ? this.projectId() : undefined),
    loader: ({ params }) => this.api.listAssignableMembers(params),
  });
  protected readonly memberItems = computed(() =>
    this.members.hasValue()
      ? assigneeOptions(this.members.value(), this.myId()).map(
          (option): PickerItem => ({
            id: option.accountId,
            label: option.label,
            avatar: {
              initials: initials(option.person),
              fill: `var(--flux-avatar-${avatarFillIndex(option.accountId) + 1})`,
            },
          })
        )
      : undefined
  );
  protected readonly assigneeDraft = signal<readonly string[]>([]);
  /** Reassign's summary: `Ada Rahman +1`. */
  protected readonly assigneeLabel = computed(() => {
    const { first, more } = assigneeSummary(this.loadedTask()?.assignees);
    const name = [first?.firstName, first?.lastName].filter(Boolean).join(' ');
    return name && more ? `${name} +${more}` : name;
  });

  /** What the parent picker searches for, sent once typing pauses. */
  protected readonly parentQuery = signal('');
  /**
   * The types a parent can be, as a string so the search isn't sent again
   * each time the task is fetched again.
   */
  private readonly parentType = computed(() => {
    const task = this.loadedTask();
    return task ? parentTypes(task.type).join(',') : undefined;
  });
  protected readonly parentResults = resource({
    params: () => {
      const type = this.parentType();
      return this.editor() === 'parent' && type
        ? {
            projectId: this.projectId(),
            type,
            search: this.parentQuery() || undefined,
          }
        : undefined;
    },
    loader: async ({ params }) =>
      (
        await this.api.listProjectTasks(params.projectId, {
          type: params.type,
          search: params.search,
          size: PARENT_PAGE_SIZE,
        })
      ).content ?? [],
  });
  protected readonly parentItems = computed(() => {
    const task = this.loadedTask();
    if (!this.parentResults.hasValue() || !task) {
      return undefined;
    }
    const rows = this.parentResults
      .value()
      .filter((t) => !!t.id && t.id !== task.id)
      .map((t): PickerItem => ({
        id: t.id ?? '',
        key: t.taskKey,
        label: t.title ?? '',
        icon: TYPE_ICONS[t.type ?? 'EPIC'],
      }));
    return task.parentTaskId
      ? [{ id: '', label: 'No parent', icon: 'x' }, ...rows]
      : rows;
  });

  private readonly commentList = new PagedList<TaskComment>(COMMENTS_PAGE_SIZE);
  protected readonly comments = signal<ListView<TaskComment>>({
    state: undefined,
    error: undefined,
  });
  protected readonly commentTotal = computed(() => {
    const state = this.comments().state;
    return state ? commentCount(state.items, state.total) : undefined;
  });

  private readonly activityList = new PagedList<TaskActivity>(
    ACTIVITY_PAGE_SIZE
  );
  private activityStarted = false;
  protected readonly activity = signal<ListView<TaskActivity>>({
    state: undefined,
    error: undefined,
  });

  /** The visible tab's list, which the infinite scroll pages. */
  protected readonly pagedTab = computed(() => {
    const tab = this.tab();
    const view =
      tab === 'comments'
        ? this.comments()
        : tab === 'activity'
          ? this.activity()
          : undefined;
    return !!view?.state && !view.state.done;
  });

  /** The task list path that detail paths sit under (this one's stack). */
  protected readonly detailBase = computed(() => {
    const segments = this.route.snapshot.pathFromRoot.flatMap((r) =>
      r.url.map((s) => s.path)
    );
    // Drop ':projectId/:taskId', keeping `.../tasks`.
    return `/${segments.slice(0, -2).join('/')}`;
  });

  private readonly refresher = signal<
    RefresherCustomEvent['target'] | undefined
  >(undefined);

  constructor() {
    this.commentList.onChange((state) =>
      this.comments.set({ state, error: undefined })
    );
    this.activityList.onChange((state) =>
      this.activity.set({ state, error: undefined })
    );
    // Comments load with the task, so their tab shows a count.
    effect(() => {
      this.ids();
      untracked(() => void this.startComments());
    });
    effect(() => {
      const refresher = this.refresher();
      if (refresher && !this.task.isLoading()) {
        void refresher.complete();
        this.refresher.set(undefined);
      }
    });
  }

  protected select(tab: DetailTab): void {
    this.tab.set(tab);
    if (tab === 'activity' && !this.activityStarted) {
      void this.startActivity();
    }
  }

  protected async copyKey(): Promise<void> {
    const key = this.header()?.taskKey;
    if (!key) {
      return;
    }
    try {
      await Clipboard.write({ string: key });
      await this.toast(`Copied ${key}`);
    } catch (error) {
      console.error('Copying the task key failed', error);
      await this.toast('Couldn’t copy the key');
    }
  }

  protected async toggleWatch(): Promise<void> {
    const watching = this.watching();
    if (watching === undefined || this.bellBusy()) {
      return;
    }
    const { projectId, taskId } = this.ids();
    this.watching.set(!watching);
    this.bellBusy.set(true);
    try {
      const result = watching
        ? await this.api.unsubscribeFromTask(projectId, taskId)
        : await this.api.subscribeToTask(projectId, taskId);
      this.watching.set(result.subscribed ?? !watching);
    } catch (error) {
      this.watching.set(watching);
      await this.toast(
        error instanceof ApiError && error.body.message
          ? error.body.message
          : watching
            ? 'Couldn’t stop watching this task'
            : 'Couldn’t watch this task'
      );
    } finally {
      this.bellBusy.set(false);
    }
  }

  protected openOverflow(): void {
    if (this.loadedTask()) {
      this.overflowChoice = undefined;
      this.overflowOpen.set(true);
    }
  }

  protected chooseOverflow(action: OverflowAction): void {
    this.overflowChoice = action;
    this.overflowOpen.set(false);
  }

  /** Runs the overflow row chosen, now that its sheet is gone. */
  protected overflowClosed(): void {
    this.overflowOpen.set(false);
    const action = this.overflowChoice;
    this.overflowChoice = undefined;
    switch (action) {
      case 'reassign':
        this.openEditor('assignees');
        break;
      case 'parent':
        this.openEditor('parent');
        break;
      case 'link':
        void this.copyLink();
        break;
      case 'watch':
        void this.toggleWatch();
        break;
      case 'archive':
        void this.archive();
        break;
      case 'delete':
        void this.confirmDelete();
        break;
    }
  }

  protected openEditor(editor: Editor): void {
    const task = this.loadedTask();
    if (!task) {
      return;
    }
    if (editor === 'labels') {
      this.labelsWanted.set(true);
      this.labelDraft.set(task.labels ?? []);
    } else if (editor === 'assignees') {
      this.membersWanted.set(true);
      this.assigneeDraft.set(
        (task.assignees ?? []).flatMap((a) =>
          a.accountId ? [a.accountId] : []
        )
      );
    } else if (editor === 'parent') {
      this.parentQuery.set('');
    }
    this.editor.set(editor);
  }

  /** A sheet closed, however it was closed. */
  protected editorClosed(editor: Editor): void {
    if (this.editor() === editor) {
      this.editor.set(undefined);
    }
    if (editor === 'labels') {
      void this.saveLabels();
    } else if (editor === 'assignees') {
      void this.saveAssignees();
    }
  }

  protected focusText(): void {
    this.textSheet()?.focus();
  }

  protected save(change: TaskChange): void {
    this.editor.set(undefined);
    const task = this.loadedTask();
    if (task) {
      void this.afterEdit(this.edits.update(task, change, this.view()));
    }
  }

  protected pickPriority(priority: string): void {
    if (priority === this.loadedTask()?.priority) {
      this.editor.set(undefined);
    } else {
      this.save({ priority: priority as Task['priority'] });
    }
  }

  protected pickType(type: string): void {
    if (type === this.loadedTask()?.type) {
      this.editor.set(undefined);
    } else {
      this.save({ type: type as Task['type'] });
    }
  }

  protected pickParent(id: string): void {
    // Read before closing: the results go with the sheet.
    const task = this.loadedTask();
    const parent = id
      ? this.parentResults.hasValue()
        ? this.parentResults.value().find((t) => t.id === id)
        : undefined
      : null;
    this.editor.set(undefined);
    if (task && id !== (task.parentTaskId ?? '') && parent !== undefined) {
      void this.afterEdit(this.edits.setParent(task, parent, this.view()));
    }
  }

  private async saveLabels(): Promise<void> {
    const task = this.loadedTask();
    if (!task || !this.projectLabels.hasValue()) {
      return;
    }
    const before = new Set(task.labels ?? []);
    const after = new Set(this.labelDraft());
    const labels = this.projectLabels.value();
    const add = labels.filter(
      (l) => after.has(l.name ?? '') && !before.has(l.name ?? '')
    );
    const remove = labels.filter(
      (l) => before.has(l.name ?? '') && !after.has(l.name ?? '')
    );
    if (add.length || remove.length) {
      await this.afterEdit(
        this.edits.setLabels(task, add, remove, this.view())
      );
    }
  }

  private async saveAssignees(): Promise<void> {
    const task = this.loadedTask();
    if (!task || !this.members.hasValue()) {
      return;
    }
    const draft = this.assigneeDraft();
    const current = (task.assignees ?? []).map((a) => a.accountId ?? '');
    if (
      draft.length === current.length &&
      draft.every((id) => current.includes(id))
    ) {
      return;
    }
    // Someone no longer assignable stays, if still chosen.
    const known: ProjectMember[] = [
      ...this.members.value(),
      ...(task.assignees ?? []),
    ];
    const members = draft.flatMap((id) => {
      const member = known.find((m) => m.accountId === id);
      return member ? [member] : [];
    });
    await this.afterEdit(this.edits.assign(task, members, this.view()));
  }

  /** Where edits show the task, and what their toasts sit above. */
  private view() {
    return {
      apply: (t: Task) => this.task.set(t),
      anchor: this.actionBar()?.nativeElement,
    };
  }

  /** The timeline has a new entry once an edit lands. */
  private async afterEdit(write: Promise<boolean>): Promise<void> {
    if ((await write) && this.activityStarted) {
      void this.startActivity();
    }
  }

  private async copyLink(): Promise<void> {
    const { projectId, taskId } = this.ids();
    const url = `${environment.webBaseUrl}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;
    try {
      await Clipboard.write({ string: url });
      await this.toast('Copied link');
    } catch (error) {
      console.error('Copying the task link failed', error);
      await this.toast('Couldn’t copy the link');
    }
  }

  /**
   * Archives the task and its subtasks, offering Undo. Detail stays open on
   * the archived task; the list further back drops its row.
   */
  private async archive(): Promise<void> {
    const task = this.loadedTask();
    if (!task) {
      return;
    }
    const archived = await this.statusChanges.archive(task, {
      removed: () => this.task.set({ ...task, isArchived: true }),
      restored: (t) => this.task.set(t),
      anchor: this.actionBar()?.nativeElement,
    });
    if (archived) {
      this.taskChanges.report({ ...task, isArchived: true });
    }
  }

  /** Deletes the task once confirmed, then goes back. */
  private async confirmDelete(): Promise<void> {
    const task = this.loadedTask();
    if (!task) {
      return;
    }
    const key = task.taskKey ?? 'this task';
    const alert = await this.alerts.create({
      header: 'Delete task?',
      message: `This will permanently delete ${key}. This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (
      role !== 'destructive' ||
      !(await this.edits.delete(task, this.actionBar()?.nativeElement))
    ) {
      return;
    }
    await this.toast(`Deleted ${key}`);
    if (!(await this.nav.pop())) {
      await this.nav.navigateBack(this.backHref());
    }
  }

  protected openSheet(expand?: string): void {
    if (this.statusReady()) {
      this.sheetExpand.set(expand);
      this.sheetOpen.set(true);
    }
  }

  /**
   * The docked button: moves to the next status, or opens the sheet when
   * that status needs a resolution or there is no next one.
   */
  protected moveNext(): void {
    const next = this.next();
    if (!next || next.isClosed) {
      this.openSheet(next?.slug);
    } else {
      void this.move({ status: next });
    }
  }

  protected async move(choice: StatusChoice): Promise<void> {
    this.sheetOpen.set(false);
    const task = this.loadedTask();
    if (!task || !this.statusReady()) {
      return;
    }
    this.statusBusy.set(true);
    try {
      const moved = await this.statusChanges.move(
        task,
        choice.status,
        choice.resolution,
        {
          apply: (t) => this.task.set(t),
          anchor: this.actionBar()?.nativeElement,
        }
      );
      // The timeline has a new entry.
      if (moved && this.activityStarted) {
        void this.startActivity();
      }
    } finally {
      this.statusBusy.set(false);
    }
  }

  protected async loadMore(event: InfiniteScrollCustomEvent): Promise<void> {
    const tab = this.tab();
    try {
      if (tab === 'comments') {
        await this.commentList.loadMore();
      } else if (tab === 'activity') {
        await this.activityList.loadMore();
      }
    } catch (error) {
      console.error('Loading more failed', error);
      await this.toast('Couldn’t load more. Pull down to try again.');
    } finally {
      void event.target.complete();
    }
  }

  protected refresh(event: RefresherCustomEvent): void {
    this.now.set(new Date());
    this.reloadTask();
    void this.startComments();
    if (this.activityStarted) {
      void this.startActivity();
    }
    // Set after the reloads start, so the effect sees them loading.
    this.refresher.set(event.target);
  }

  protected retry(): void {
    this.reloadTask();
  }

  protected async startComments(): Promise<void> {
    this.comments.update((view) => ({ ...view, error: undefined }));
    const { projectId, taskId } = this.ids();
    try {
      await this.commentList.start((page, size) =>
        this.api.listTaskComments(projectId, taskId, { page, size })
      );
    } catch (error) {
      this.comments.update((view) => ({ ...view, error }));
    }
  }

  protected async startActivity(): Promise<void> {
    this.activityStarted = true;
    this.activity.update((view) => ({ ...view, error: undefined }));
    const { projectId, taskId } = this.ids();
    try {
      await this.activityList.start((page, size) =>
        this.api.listTaskActivities(projectId, taskId, { page, size })
      );
    } catch (error) {
      this.activity.update((view) => ({ ...view, error }));
    }
  }

  private reloadTask(): void {
    this.task.reload();
    this.statuses.reload();
    this.subscription.reload();
    this.subtasks.reload();
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: 2000,
      position: 'bottom',
    });
    await toast.present();
  }
}

/** The row passed in the navigation's state (see the list rows' links). */
function readPassedRow(router: Router): TaskPreview | undefined {
  const state =
    untracked(() => router.currentNavigation())?.extras.state ??
    (globalThis.history?.state as Record<string, unknown> | undefined);
  const task = state?.['task'];
  return typeof task === 'object' && task !== null
    ? (task as TaskPreview)
    : undefined;
}
