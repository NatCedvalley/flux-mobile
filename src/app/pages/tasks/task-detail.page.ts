import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Clipboard } from '@capacitor/clipboard';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonToolbar,
  ToastController,
  type InfiniteScrollCustomEvent,
  type RefresherCustomEvent,
} from '@ionic/angular';
import type { MyTask, Task, TaskActivity, TaskComment } from '@core/api';
import { ApiError } from '@core/auth';
import { localIsoDate } from '@core/my-work';
import { priorityFact } from '@core/project-list';
import { commentCount } from '@core/task-detail';
import { PagedList, type PagedListState } from '@core/task-filters';
import { AuthService } from '../../auth/auth.service';
import { FLUX_API } from '../../providers/flux-api.token';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { SkeletonRowsComponent } from '../../shared/skeleton-rows/skeleton-rows.component';
import { TYPE_ICONS } from '../../shared/task-row/task-row.component';
import { statusPill } from './status-pill';
import { TaskActivityComponent } from './task-activity/task-activity.component';
import { TaskCommentsComponent } from './task-comments/task-comments.component';
import { TaskDetailsSkeletonComponent } from './task-details/task-details-skeleton.component';
import { TaskDetailsComponent } from './task-details/task-details.component';

export type DetailTab = 'activity' | 'comments' | 'details';

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
 * chips, then Details, Comments and Activity tabs. Display-only apart from
 * the bell; editing comes in later FM-6 slices.
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
  ],
})
export class TaskDetailPage {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);
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

  /** The bell: set as soon as it's tapped, put back if the server refuses. */
  protected readonly watching = linkedSignal(() =>
    this.subscription.hasValue()
      ? this.subscription.value().subscribed
      : undefined
  );
  private readonly bellBusy = signal(false);

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
