import {
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { App } from '@capacitor/app';
import type { AppNotification } from '@core/api';
import { MENTION_TYPES, isMention } from '@core/inbox';
import { AuthService } from '../auth/auth.service';
import { FLUX_API } from '../providers/flux-api.token';

/**
 * The signed-in account's unread counts: every type (the Inbox tab's badge
 * and header) and mentions (the Mentions segment's badge). Refreshed on
 * sign-in, on app resume, and by the Inbox after each read change and on
 * pull-to-refresh. Both are undefined until loaded, and cleared on sign-out.
 */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly api = inject(FLUX_API);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly accountId = computed(() => this.auth.account()?.id);

  private readonly unreadCount = signal<number | undefined>(undefined);
  private readonly mentionCount = signal<number | undefined>(undefined);
  readonly unread = this.unreadCount.asReadonly();
  readonly mentions = this.mentionCount.asReadonly();

  private readonly version = signal(0);
  /**
   * Bumped when the notifications changed outside the Inbox page (a push
   * arrived, or one was read from a push), so a loaded Inbox reloads.
   */
  readonly listVersion = this.version.asReadonly();

  /** Bumped by a sign-out, so a refresh started before it is dropped. */
  private generation = 0;

  /** Runs once at startup. */
  init(): void {
    void App.addListener('resume', () => {
      if (this.accountId()) {
        void this.refresh();
      }
    });
    // Watched only after the cold-start restore: until then, no account
    // just means not restored yet.
    void this.auth.restore().then(() =>
      effect(
        () => {
          const id = this.accountId();
          untracked(() => (id ? void this.refresh() : this.clear()));
        },
        { injector: this.injector }
      )
    );
  }

  /**
   * Fetches both counts at once. A count that fails keeps its old value:
   * the next refresh tries again.
   */
  async refresh(): Promise<void> {
    const generation = this.generation;
    const [unread, mentions] = await Promise.allSettled([
      this.api.notificationUnreadCount(),
      this.api.notificationUnreadCount(MENTION_TYPES.join(',')),
    ]);
    if (generation !== this.generation) {
      return;
    }
    if (unread.status === 'fulfilled') {
      this.unreadCount.set(unread.value.unreadCount ?? 0);
    } else {
      console.error('Loading the unread count failed', unread.reason);
    }
    if (mentions.status === 'fulfilled') {
      this.mentionCount.set(mentions.value.unreadCount ?? 0);
    } else {
      console.error('Loading the mention count failed', mentions.reason);
    }
  }

  /**
   * Moves the counts by `delta` for one notification read (-1) or put back
   * to unread (+1) on the device, before the server says so.
   */
  adjust(notification: AppNotification, delta: number): void {
    const move = (count: number | undefined) =>
      count === undefined ? undefined : Math.max(0, count + delta);
    this.unreadCount.update(move);
    if (isMention(notification)) {
      this.mentionCount.update(move);
    }
  }

  /** Mark all read: both counts to 0. Returns what puts them back. */
  clearUnread(): () => void {
    const unread = this.unreadCount();
    const mentions = this.mentionCount();
    this.unreadCount.update((count) => (count === undefined ? count : 0));
    this.mentionCount.update((count) => (count === undefined ? count : 0));
    return () => {
      this.unreadCount.set(unread);
      this.mentionCount.set(mentions);
    };
  }

  /** Tells a loaded Inbox page to reload its lists. */
  listsChanged(): void {
    this.version.update((version) => version + 1);
  }

  private clear(): void {
    this.generation++;
    this.unreadCount.set(undefined);
    this.mentionCount.set(undefined);
  }
}
