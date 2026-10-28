import {
  Injectable,
  Injector,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  FirebaseMessaging,
  type Notification,
} from '@capacitor-firebase/messaging';
import { NavController, ToastController } from '@ionic/angular';
import { ApiError } from '@core/auth';
import { type PushMessage, parsePushData, pushTarget } from '@core/push';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthService } from '../auth/auth.service';
import { InboxService } from '../inbox/inbox.service';
import { AppLockService } from '../lock/app-lock.service';
import { FLUX_API } from '../providers/flux-api.token';
import { PushService } from './push.service';

/** How long a foreground push's toast stays. */
const TOAST_MS = 5000;

/** Where a push was opened from: the system's notification, or our toast. */
type PushSource = 'tap' | 'toast';

/**
 * What a push does once it's here: a tap opens its task on the Inbox stack
 * (or the Inbox, when it has no task) and marks it read, and a push that
 * arrives while the app is open shows a toast with Open, since Android
 * doesn't show those and iOS is told not to (`presentationOptions`).
 *
 * The plugin keeps a cold start's tap until the listener is added, and the
 * tap waits for the session to be restored and the app unlocked. A tap with
 * no one signed in opens nothing, then or later.
 */
@Injectable({ providedIn: 'root' })
export class PushOpenService {
  private readonly api = inject(FLUX_API);
  private readonly auth = inject(AuthService);
  private readonly lock = inject(AppLockService);
  private readonly inbox = inject(InboxService);
  private readonly nav = inject(NavController);
  private readonly toasts = inject(ToastController);
  private readonly injector = inject(Injector);
  private readonly available = inject(PushService).available;
  private readonly analytics = inject(AnalyticsService);

  /**
   * A tap (or a toast's Open) waiting to be opened. Its message is null if
   * it couldn't be read.
   */
  private readonly pending = signal<{
    message: PushMessage | null;
    from: PushSource;
  } | null>(null);
  private toast: HTMLIonToastElement | undefined;

  /** Runs once at startup, where push is available. */
  init(): void {
    if (!this.available) {
      return;
    }
    void FirebaseMessaging.addListener(
      'notificationActionPerformed',
      ({ notification }) => this.open(parsePushData(notification.data), 'tap')
    );
    void FirebaseMessaging.addListener(
      'notificationReceived',
      ({ notification }) => void this.received(notification)
    );

    // Watched only after the cold-start restore: until then, signed out
    // just means not restored yet.
    void this.auth.restore().then(() =>
      effect(
        () => {
          const tap = this.pending();
          if (!tap) {
            return;
          }
          if (!this.auth.isSignedIn()) {
            this.pending.set(null);
          } else if (!this.lock.locked()) {
            this.pending.set(null);
            untracked(() => void this.go(tap.message, tap.from));
          }
        },
        { injector: this.injector }
      )
    );
  }

  /** A tap, or a toast's Open. The last one wins. */
  private open(message: PushMessage | null, from: PushSource): void {
    this.pending.set({ message, from });
  }

  /**
   * Lands on the Inbox first, so the task opens over it: back returns
   * there, and Android's Back pops instead of leaving the app.
   */
  private async go(
    message: PushMessage | null,
    from: PushSource
  ): Promise<void> {
    if (message) {
      void this.markRead(message.notificationId);
    }
    const target = pushTarget(message);
    void this.analytics.log({
      name: 'push_open',
      params: { from, target: target.kind },
    });
    await this.nav.navigateBack('/tabs/inbox', { animated: false });
    if (target.kind === 'task') {
      await this.nav.navigateForward([
        '/tabs/inbox/tasks',
        target.projectId,
        target.taskId,
      ]);
    }
  }

  /**
   * A 404 is a notification that's gone (or another account's): nothing to
   * mark. Other failures are only logged, since nothing on screen is wrong.
   */
  private async markRead(id: string): Promise<void> {
    try {
      await this.api.markNotificationRead(id);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        console.error('Marking the push read failed', error);
      }
      return;
    }
    void this.inbox.refresh();
    this.inbox.listsChanged();
  }

  /**
   * A push while the app is open: the Inbox and its badge catch up, and a
   * toast at the top, clear of the Undo toast, the tab bar and the docked
   * bar, offers to open it. A newer push replaces it.
   */
  private async received(notification: Notification): Promise<void> {
    void this.inbox.refresh();
    this.inbox.listsChanged();

    const message = parsePushData(notification.data);
    const toast = await this.toasts.create({
      header: notification.title || undefined,
      message: notification.body,
      duration: TOAST_MS,
      position: 'top',
      buttons: [{ text: 'Open', handler: () => this.open(message, 'toast') }],
    });
    void this.toast?.dismiss();
    this.toast = toast;
    await toast.present();
  }
}
