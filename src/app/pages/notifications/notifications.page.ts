import {
  Component,
  type ResourceRef,
  type WritableSignal,
  computed,
  effect,
  inject,
  resource,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
  IonLabel,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
  NavController,
  ToastController,
  type InfiniteScrollCustomEvent,
  type ItemSlidingCustomEvent,
  type RefresherCustomEvent,
  type SegmentCustomEvent,
} from '@ionic/angular';
import type { AppNotification } from '@core/api';
import { ApiError } from '@core/auth';
import {
  INBOX_SEGMENTS,
  type InboxSegment,
  inboxGroups,
  opensTask,
} from '@core/inbox';
import { PagedList, type PagedListState } from '@core/task-filters';
import { InboxService } from '../../inbox/inbox.service';
import { NotificationRowComponent } from '../../inbox/notification-row/notification-row.component';
import { FLUX_API } from '../../providers/flux-api.token';
import { PushCardComponent } from '../../push/push-card/push-card.component';
import { PushService } from '../../push/push.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { SkeletonRowsComponent } from '../../shared/skeleton-rows/skeleton-rows.component';
import { impact } from '../../task-status/haptics';
import { UndoToastService } from '../../task-status/undo-toast.service';

/** Rows per request. */
const PAGE_SIZE = 30;
const TOAST_MS = 3000;
/** Toasts sit above the tab bar. */
const ANCHOR = 'tab-bar';

/** One segment's rows, paged from the server by its `type`. */
type SegmentList = {
  /** Set the first time it's shown: each segment loads then. */
  opened: WritableSignal<boolean>;
  list: PagedList<AppNotification>;
  state: WritableSignal<PagedListState<AppNotification>>;
  results: ResourceRef<boolean | undefined>;
};

/**
 * The Inbox tab (handoff 3l): the account's notifications in All, Mentions
 * and Assigned, grouped into Today and Earlier. A tap marks a row read and
 * opens its task on this tab's stack; a swipe marks it read (with Undo, the
 * write waiting until Undo has gone) or mutes the task. The unread counts
 * come from `InboxService`, which also feeds the tab badge.
 */
@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonContent,
    IonIcon,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonItemDivider,
    IonItemGroup,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonRefresher,
    IonRefresherContent,
    IonSegment,
    IonSegmentButton,
    EmptyStateComponent,
    ErrorStateComponent,
    NotificationRowComponent,
    PushCardComponent,
    SkeletonRowsComponent,
  ],
})
export class NotificationsPage {
  private readonly api = inject(FLUX_API);
  private readonly nav = inject(NavController);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastController);
  private readonly undo = inject(UndoToastService);
  protected readonly inbox = inject(InboxService);
  protected readonly push = inject(PushService);

  protected readonly segments = INBOX_SEGMENTS;
  protected readonly segment = signal<InboxSegment>('all');
  /** The moment ages and Today are read against; reset on every load. */
  protected readonly now = signal(new Date());

  private readonly lists: Record<InboxSegment, SegmentList> = {
    all: this.segmentList('all'),
    mentions: this.segmentList('mentions'),
    assigned: this.segmentList('assigned'),
  };

  protected readonly current = computed(() => this.lists[this.segment()]);
  protected readonly rows = computed(() => this.current().state());
  protected readonly groups = computed(() =>
    inboxGroups(this.rows().items, this.now())
  );

  /** The next page failed: Retry says so instead of a stopped spinner. */
  protected readonly moreFailed = signal(false);
  protected readonly retryingMore = signal(false);

  /** The pull-to-refresh in progress, completed once its reload settles. */
  private readonly refresher = signal<
    RefresherCustomEvent['target'] | undefined
  >(undefined);
  /** The row whose swipe buttons are fully out, for the reveal haptic. */
  private revealed: EventTarget | null = null;

  protected readonly opensTask = opensTask;

  constructor() {
    effect(() => {
      const refresher = this.refresher();
      if (refresher && !this.current().results.isLoading()) {
        void refresher.complete();
        this.refresher.set(undefined);
      }
    });
  }

  protected select(event: SegmentCustomEvent): void {
    const segment = event.detail.value as InboxSegment;
    this.lists[segment].opened.set(true);
    this.moreFailed.set(false);
    this.segment.set(segment);
  }

  /** Reloads the visible segment and the counts, keeping the rows meanwhile. */
  protected refresh(event: RefresherCustomEvent): void {
    this.current().results.reload();
    void this.inbox.refresh();
    // Set after the reload starts, so the effect sees it loading.
    this.refresher.set(event.target);
  }

  protected loadMore(event: InfiniteScrollCustomEvent): void {
    void this.nextPage().finally(() => void event.target.complete());
  }

  protected retryMore(): void {
    this.retryingMore.set(true);
    void this.nextPage().finally(() => this.retryingMore.set(false));
  }

  /** A tap: marks the row read at once, then opens its task if it has one. */
  protected open(notification: AppNotification): void {
    if (!notification.isRead) {
      void this.markRead(notification);
    }
    if (opensTask(notification)) {
      void this.nav.navigateForward(
        ['tasks', notification.projectId, notification.entityId],
        { relativeTo: this.route }
      );
    }
  }

  /**
   * Swipe Mark read: the row reads as read at once, with Undo. There's no
   * way back to unread on the server, so the write waits until the Undo
   * toast has gone without Undo.
   */
  protected swipeRead(
    notification: AppNotification,
    sliding: IonItemSliding
  ): void {
    void sliding.close();
    void impact('medium');
    this.setRead(notification, true);
    void this.undo.offer(
      'Marked read',
      ANCHOR,
      async () => this.setRead(notification, false),
      () => void this.commitRead(notification)
    );
  }

  /**
   * Mute: stops the task's activity notifications (DELETE …/subscribe).
   * Mentions and assignments still arrive, so it promises no more.
   */
  protected async mute(
    notification: AppNotification,
    sliding: IonItemSliding
  ): Promise<void> {
    void sliding.close();
    void impact('medium');
    try {
      await this.api.unsubscribeFromTask(
        notification.projectId ?? '',
        notification.entityId ?? ''
      );
    } catch (error) {
      await this.toast(error, "Couldn't mute the task.");
      return;
    }
    await this.toast(undefined, `Muted ${notification.taskKey}`);
  }

  /** Every loaded row and the counts go to read at once; no Undo. */
  protected async markAllRead(): Promise<void> {
    // A swipe's Undo would put back a row the server has now read.
    this.undo.dismiss();
    const unread = new Set(
      Object.values(this.lists).flatMap(({ list }) =>
        list.state.items.filter((n) => !n.isRead).map((n) => n.id)
      )
    );
    this.editRows((n) => (unread.has(n.id) ? { ...n, isRead: true } : n));
    const restore = this.inbox.clearUnread();
    try {
      await this.api.markAllNotificationsRead();
    } catch (error) {
      this.editRows((n) => (unread.has(n.id) ? { ...n, isRead: false } : n));
      restore();
      await this.toast(error, "Couldn't mark everything read.");
    }
    void this.inbox.refresh();
  }

  /** The haptic for a row's swipe buttons coming fully out. */
  protected dragged(event: ItemSlidingCustomEvent): void {
    const ratio = Math.abs((event.detail as { ratio: number }).ratio);
    if (ratio >= 1 && this.revealed !== event.target) {
      this.revealed = event.target;
      void impact('light');
    } else if (ratio < 1 && this.revealed === event.target) {
      this.revealed = null;
    }
  }

  private segmentList(key: InboxSegment): SegmentList {
    const type = INBOX_SEGMENTS.find((s) => s.key === key)?.type;
    const opened = signal(key === 'all');
    const list = new PagedList<AppNotification>(PAGE_SIZE);
    const state = signal(list.state);
    list.onChange((next) => {
      state.set(next);
      this.moreFailed.set(false);
    });
    const results = resource({
      params: () => (opened() ? true : undefined),
      loader: async () => {
        await list.start((page, size) =>
          this.api.listNotifications({ type, page, size })
        );
        this.now.set(new Date());
        return true;
      },
    });
    return { opened, list, state, results };
  }

  private async nextPage(): Promise<void> {
    try {
      await this.current().list.loadMore();
    } catch (error) {
      console.error('Loading more notifications failed', error);
      this.moreFailed.set(true);
    }
  }

  /** Marks a row read for a tap: straight away, no Undo. */
  private async markRead(notification: AppNotification): Promise<void> {
    this.setRead(notification, true);
    await this.commitRead(notification);
  }

  /** Sends a read already shown, putting the row back if it's refused. */
  private async commitRead(notification: AppNotification): Promise<void> {
    try {
      await this.api.markNotificationRead(notification.id ?? '');
    } catch (error) {
      this.setRead(notification, false);
      await this.toast(error, "Couldn't mark it read.");
    }
    void this.inbox.refresh();
  }

  /**
   * Shows a row as read or unread in every segment it's loaded in (a
   * mention is in All too), and moves the counts to match.
   */
  private setRead(notification: AppNotification, isRead: boolean): void {
    this.editRows((n) => (n.id === notification.id ? { ...n, isRead } : n));
    this.inbox.adjust(notification, isRead ? -1 : 1);
  }

  private editRows(change: (n: AppNotification) => AppNotification): void {
    for (const { list } of Object.values(this.lists)) {
      list.edit((items) => items.map(change));
    }
  }

  /** A short toast: the server's message for `error`, else `fallback`. */
  private async toast(error: unknown, fallback: string): Promise<void> {
    if (error) {
      this.undo.dismiss();
    }
    const toast = await this.toasts.create({
      message:
        error instanceof ApiError && error.body.message
          ? error.body.message
          : fallback,
      duration: TOAST_MS,
      position: 'bottom',
      positionAnchor: ANCHOR,
    });
    await toast.present();
  }
}
