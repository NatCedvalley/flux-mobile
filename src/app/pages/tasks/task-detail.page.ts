import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
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
  Attachment,
  MyTask,
  ProjectMember,
  Task,
  TaskActivity,
  TaskComment,
} from '@core/api';
import { ApiError } from '@core/auth';
import {
  canEditComment,
  mentionOptions,
  withComment,
  withoutComment,
} from '@core/comments';
import { localIsoDate } from '@core/my-work';
import { avatarFillIndex, initials } from '@core/people';
import { can } from '@core/permissions';
import { priorityFact } from '@core/project-list';
import { TASK_TYPES } from '@core/task-create';
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
import { AttachSourceSheetComponent } from '../../attachments/attach-source-sheet/attach-source-sheet.component';
import {
  type AttachmentTarget,
  AttachmentService,
} from '../../attachments/attachment.service';
import { AttachmentsSheetComponent } from '../../attachments/attachments-sheet/attachments-sheet.component';
import {
  type FileSource,
  FileSourceService,
} from '../../attachments/file-source.service';
import { AuthService } from '../../auth/auth.service';
import {
  type CommentTarget,
  CommentService,
} from '../../comments/comment.service';
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
import {
  type CommentDraft,
  CommentComposerComponent,
} from './comment-composer/comment-composer.component';
import {
  type CommentSheetChoice,
  type CommentSheetMode,
  CommentSheetComponent,
} from './comment-sheet/comment-sheet.component';
import { statusPill } from './status-pill';
import { TaskActionBarComponent } from './task-action-bar/task-action-bar.component';
import { TaskActivityComponent } from './task-activity/task-activity.component';
import {
  type CommentReact,
  TaskCommentsComponent,
} from './task-comments/task-comments.component';
import { TaskDetailsSkeletonComponent } from './task-details/task-details-skeleton.component';
import { TaskDetailsComponent } from './task-details/task-details.component';
import {
  type OverflowAction,
  TaskOverflowSheetComponent,
} from './task-overflow-sheet/task-overflow-sheet.component';

export type DetailTab = 'activity' | 'comments' | 'details';

/** The field editors, each a sheet, the comment ones and the attachment ones. */
type Editor =
  | 'assignees'
  | 'attachSource'
  | 'attachments'
  | 'comment'
  | 'description'
  | 'due'
  | 'labels'
  | 'mention'
  | 'parent'
  | 'priority'
  | 'title'
  | 'type';

/** How long a loaded list's file URLs are trusted (the server signs 15 min). */
const ATTACHMENT_URLS_FRESH_MS = 10 * 60_000;

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

/** The comment sheet open, and the comment it was opened on. */
type CommentSheet = { mode: CommentSheetMode; comment: TaskComment };

/** A list not loaded yet (`state` undefined), or that failed. */
type ListView<T> = {
  state: PagedListState<T> | undefined;
  error: unknown;
};

/**
 * Task detail (handoff 3e–3g): a header with the key, watch bell, title and
 * chips, then Details, Comments and Activity tabs, over a docked action bar
 * (the comment composer on the Comments tab).
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
    CommentComposerComponent,
    CommentSheetComponent,
    PickerSheetComponent,
    TextEditSheetComponent,
    DateSheetComponent,
    AttachmentsSheetComponent,
    AttachSourceSheetComponent,
  ],
})
export class TaskDetailPage {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);
  private readonly alerts = inject(AlertController);
  private readonly nav = inject(NavController);
  private readonly statusChanges = inject(TaskStatusService);
  private readonly edits = inject(TaskEditService);
  private readonly commentWrites = inject(CommentService);
  private readonly attachmentWrites = inject(AttachmentService);
  private readonly files = inject(FileSourceService);
  private readonly injector = inject(Injector);
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
  /** Every role reacts. */
  protected readonly canReact = computed(() => can(this.role(), 'read'));
  /** The Comments tab docks the composer in place of the action bar. */
  protected readonly showComposer = computed(
    () => this.canComment() && this.tab() === 'comments'
  );
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
  /** The docked bar or the composer, which toasts sit above. */
  private readonly actionBar = viewChild(TaskActionBarComponent, {
    read: ElementRef,
  });
  private readonly composerElement = viewChild(CommentComposerComponent, {
    read: ElementRef,
  });
  private readonly composer = viewChild(CommentComposerComponent);
  private readonly content = viewChild(IonContent);

  /** The bell: set as soon as it's tapped, put back if the server refuses. */
  protected readonly watching = linkedSignal(() =>
    this.subscription.hasValue()
      ? this.subscription.value().subscribed
      : undefined
  );
  private readonly bellBusy = signal(false);

  /**
   * The task's attachments, loaded with it (the task has no count of them).
   * Their URLs expire 15 minutes after this load (see `openAttachment`).
   */
  protected readonly attachments = resource({
    params: this.ids,
    loader: async ({ params }) => {
      const list = await this.api.listTaskAttachments(
        params.projectId,
        params.taskId
      );
      this.attachmentsLoadedAt = Date.now();
      return list;
    },
  });
  private attachmentsLoadedAt = 0;
  /** The Details row's count: blank while loading, `—` if it failed. */
  protected readonly attachmentCount = computed(() =>
    this.attachments.hasValue()
      ? String(this.attachments.value().length)
      : this.attachments.error()
        ? '—'
        : ''
  );
  /** The name of the file being uploaded, if one is. */
  protected readonly uploading = signal<string | undefined>(undefined);
  protected readonly fileSources = this.files.sources;
  /** The source chosen in the source sheet, run once it has closed. */
  private sourceChoice: FileSource | undefined;

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
  protected readonly typeItems: PickerItem[] = TASK_TYPES.map((type) => ({
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
  /** Who a comment can mention: the members but the caller, by name. */
  private readonly mentionChoices = computed(() =>
    this.members.hasValue()
      ? mentionOptions(this.members.value(), this.myId())
      : undefined
  );
  protected readonly mentionItems = computed(() =>
    this.mentionChoices()?.map((option): PickerItem => ({
      id: option.accountId,
      label: option.name,
      avatar: {
        initials: initials(option.member),
        fill: `var(--flux-avatar-${avatarFillIndex(option.accountId) + 1})`,
      },
    }))
  );
  /** The member picked for a mention, put in once the picker has closed. */
  private mentionPicked: { id: string; name: string } | undefined;
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
  /** A comment is posting: Send waits. */
  protected readonly sending = signal(false);
  protected readonly commentSheet = signal<CommentSheet | undefined>(undefined);
  protected readonly commentSheetOpen = signal(false);
  /** The comment sheet's row chosen, run once the sheet has closed. */
  private commentChoice: CommentSheetChoice | undefined;
  /** The comment being edited in the text sheet. */
  protected readonly editingComment = signal<TaskComment | undefined>(
    undefined
  );
  protected readonly canEditComment = canEditComment;

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

  /** The docked comment button: the Comments tab, ready to type. */
  protected openComposer(): void {
    this.select('comments');
    afterNextRender(() => void this.composer()?.focus(), {
      injector: this.injector,
    });
  }

  /** The composer asked for the member picker. */
  protected openMentions(): void {
    this.mentionPicked = undefined;
    this.membersWanted.set(true);
    this.editor.set('mention');
  }

  protected pickMention(id: string): void {
    const option = this.mentionChoices()?.find((o) => o.accountId === id);
    this.mentionPicked = option && { id, name: option.name };
    this.editor.set(undefined);
  }

  protected async postComment(draft: CommentDraft): Promise<void> {
    if (this.sending()) {
      return;
    }
    this.sending.set(true);
    try {
      const posted = await this.commentWrites.post(
        this.commentTarget(),
        draft.body,
        draft.mentionedAccountIds
      );
      if (!posted) {
        return;
      }
      this.composer()?.clear();
      this.commentList.edit((items) => [...items, posted], 1);
      afterNextRender(() => void this.content()?.scrollToBottom(300), {
        injector: this.injector,
      });
    } finally {
      this.sending.set(false);
    }
  }

  protected async react({ comment, emoji }: CommentReact): Promise<void> {
    const reactions = await this.commentWrites.react(
      this.commentTarget(),
      comment,
      emoji
    );
    if (reactions && comment.id) {
      this.commentList.edit((items) =>
        withComment(items, comment.id ?? '', (c) => ({ ...c, reactions }))
      );
    }
  }

  protected openCommentSheet(
    mode: CommentSheetMode,
    comment: TaskComment
  ): void {
    this.commentChoice = undefined;
    this.commentSheet.set({ mode, comment });
    this.commentSheetOpen.set(true);
  }

  protected chooseInCommentSheet(choice: CommentSheetChoice): void {
    this.commentChoice = choice;
    this.commentSheetOpen.set(false);
  }

  /** Runs the comment sheet's row chosen, now that the sheet is gone. */
  protected commentSheetClosed(): void {
    this.commentSheetOpen.set(false);
    const comment = this.commentSheet()?.comment;
    const choice = this.commentChoice;
    this.commentChoice = undefined;
    if (!comment || !choice) {
      return;
    }
    switch (choice.kind) {
      case 'react':
        void this.react({ comment, emoji: choice.emoji });
        break;
      case 'edit':
        this.editingComment.set(comment);
        this.editor.set('comment');
        break;
      case 'delete':
        void this.confirmDeleteComment(comment);
        break;
    }
  }

  protected async saveComment(body: string): Promise<void> {
    const comment = this.editingComment();
    this.editor.set(undefined);
    if (!comment?.id) {
      return;
    }
    const saved = await this.commentWrites.update(
      this.commentTarget(),
      comment,
      body
    );
    if (saved) {
      // The response has no reactions or replies: keep the shown ones.
      this.commentList.edit((items) =>
        withComment(items, comment.id ?? '', (c) => ({
          ...c,
          body: saved.body,
          bodyFormat: saved.bodyFormat,
          edited: saved.edited,
          editedAt: saved.editedAt,
          updatedAt: saved.updatedAt,
        }))
      );
    }
  }

  /** Deletes the caller's comment once confirmed. */
  private async confirmDeleteComment(comment: TaskComment): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Delete comment?',
      message: 'This comment will be deleted. This action cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (
      role !== 'destructive' ||
      !(await this.commentWrites.remove(this.commentTarget(), comment))
    ) {
      return;
    }
    // A reply isn't in the server's total, which counts threads only.
    this.commentList.edit(
      (items) => withoutComment(items, comment.id ?? ''),
      comment.parentCommentId ? 0 : -1
    );
  }

  protected openAttachments(): void {
    this.membersWanted.set(true);
    this.editor.set('attachments');
  }

  /**
   * The composer's paperclip: where to attach from, or straight to the file
   * picker when that's the only source (web).
   */
  protected openAttachSource(): void {
    if (this.fileSources.length === 1) {
      void this.attach(this.fileSources[0]);
      return;
    }
    this.sourceChoice = undefined;
    this.editor.set('attachSource');
  }

  protected chooseSource(source: FileSource): void {
    this.sourceChoice = source;
    this.editor.set(undefined);
  }

  /** Picks a file from `source` and uploads it, showing it at the top. */
  protected async attach(source: FileSource): Promise<void> {
    if (this.uploading()) {
      return;
    }
    const file = await this.files.pick(source);
    if (!file) {
      return;
    }
    this.uploading.set(file.name);
    try {
      const added = await this.attachmentWrites.upload(
        this.attachmentTarget(),
        file
      );
      if (added && this.attachments.hasValue()) {
        this.attachments.set([added, ...this.attachments.value()]);
      } else if (added) {
        this.attachments.reload();
      }
    } finally {
      this.uploading.set(undefined);
    }
  }

  /**
   * Opens the file. Its URLs expire 15 minutes after they were signed, so a
   * list older than 10 minutes is fetched again first.
   */
  protected async openAttachment(attachment: Attachment): Promise<void> {
    let current: Attachment | undefined = attachment;
    if (Date.now() - this.attachmentsLoadedAt > ATTACHMENT_URLS_FRESH_MS) {
      const { projectId, taskId } = this.ids();
      try {
        const list = await this.api.listTaskAttachments(projectId, taskId);
        this.attachmentsLoadedAt = Date.now();
        this.attachments.set(list);
        current = list.find((a) => a.id === attachment.id);
      } catch (error) {
        console.error('Refreshing the attachments failed', error);
        await this.toast('Couldn’t open the file. Try again.');
        return;
      }
    }
    if (!current) {
      await this.toast('This file has been removed.');
      return;
    }
    await this.attachmentWrites.open(current, this.anchor());
  }

  /** The task files are attached to, and where their toasts sit. */
  private attachmentTarget(): AttachmentTarget {
    return { ...this.ids(), anchor: this.anchor() };
  }

  /** The task comments are written on, and where their toasts sit. */
  private commentTarget(): CommentTarget {
    return { ...this.ids(), anchor: this.anchor() };
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
    } else if (editor === 'mention' && this.mentionPicked) {
      void this.composer()?.insertMention(this.mentionPicked);
      this.mentionPicked = undefined;
    } else if (editor === 'comment') {
      this.editingComment.set(undefined);
    } else if (editor === 'attachSource' && this.sourceChoice) {
      void this.attach(this.sourceChoice);
      this.sourceChoice = undefined;
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
      anchor: this.anchor(),
    };
  }

  /** The docked footer showing, which toasts sit above (none for a VIEWER). */
  private anchor(): HTMLElement | undefined {
    return (this.actionBar() ?? this.composerElement())?.nativeElement;
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
      anchor: this.anchor(),
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
      !(await this.edits.delete(task, this.anchor()))
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
          anchor: this.anchor(),
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
    this.attachments.reload();
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
