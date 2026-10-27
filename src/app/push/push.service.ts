import {
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FirebaseMessaging, Importance } from '@capacitor-firebase/messaging';
import { App } from '@capacitor/app';
import { Capacitor, type PermissionState } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import {
  AndroidSettings,
  IOSSettings,
  NativeSettings,
} from 'capacitor-native-settings';
import { PushRegistration } from '@core/push';
import { buildInfo } from '../../environments/build-info';
import { AuthService } from '../auth/auth.service';
import { hasFirebaseConfig } from '../firebase/firebase-config';
import { FLUX_API } from '../providers/flux-api.token';
import { NotificationState } from './notification-state';

/** Set once the Inbox card is dismissed. Kept across logouts. */
const CARD_DISMISSED_KEY = 'push.cardDismissed';

/** FCM's default channel, named in AndroidManifest.xml. */
export const TASK_UPDATES_CHANNEL = 'task_updates';

/**
 * Push on this device: the Inbox card that asks for permission, and keeping
 * the FCM token registered to whoever is signed in (`PushRegistration`).
 *
 * Native only, and only in a build that had the platform's Firebase config
 * file (`buildInfo.push`). Anywhere else push is off and the plugin is never
 * called.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly registration = new PushRegistration(
    inject(FLUX_API),
    Capacitor.getPlatform() === 'ios' ? 'IOS' : 'ANDROID',
    buildInfo.version
  );
  private readonly permissionState = signal<PermissionState | null>(null);
  private readonly dismissed = signal(false);

  /** False on web and in a build without the platform's Firebase file. */
  readonly available = hasFirebaseConfig();

  /**
   * The OS permission for notifications, re-checked on resume. Null until
   * it's known, and always null where push isn't available.
   */
  readonly permission = this.permissionState.asReadonly();

  /**
   * Whether the Inbox shows the card: only while the OS would still prompt.
   * Once allowed or denied, the card has nothing left to offer.
   */
  readonly showCard = computed(() => {
    const permission = this.permissionState();
    return (
      (permission === 'prompt' || permission === 'prompt-with-rationale') &&
      !this.dismissed()
    );
  });

  /** Runs once at startup. Never rejects: a failure leaves push off. */
  async init(): Promise<void> {
    if (!this.available) {
      return;
    }
    try {
      if (Capacitor.getPlatform() === 'android') {
        await FirebaseMessaging.createChannel({
          id: TASK_UPDATES_CHANNEL,
          name: 'Task updates',
          importance: Importance.Default,
        });
      }
      const [{ receive }, { value }] = await Promise.all([
        FirebaseMessaging.checkPermissions(),
        Preferences.get({ key: CARD_DISMISSED_KEY }),
      ]);
      this.permissionState.set(await withAppSwitch(receive));
      this.dismissed.set(value === 'true');
    } catch (error) {
      console.error('Setting up push failed', error);
      return;
    }

    void FirebaseMessaging.addListener(
      'tokenReceived',
      ({ token }) => void this.registration.setToken(token)
    );
    // While the access token is still live: the logout revokes it.
    this.auth.setBeforeLogout(() => this.registration.unregister());
    // Permission can be granted in the OS settings while the app is away.
    void App.addListener('resume', () => void this.refreshPermission());

    // Watched only after the cold-start restore: until then, no account
    // just means not restored yet.
    void this.auth
      .restore()
      .then(() =>
        effect(
          () =>
            void this.registration.setAccount(this.auth.account()?.id ?? null),
          { injector: this.injector }
        )
      );
    await this.fetchToken();
  }

  /**
   * The Inbox card's and the Notifications page's Turn on: the only places
   * the OS permission prompt appears.
   */
  async enable(): Promise<void> {
    try {
      const { receive } = await FirebaseMessaging.requestPermissions();
      this.permissionState.set(await withAppSwitch(receive));
    } catch (error) {
      console.error('Requesting push permission failed', error);
      return;
    }
    await this.fetchToken();
  }

  async dismissCard(): Promise<void> {
    this.dismissed.set(true);
    try {
      await Preferences.set({ key: CARD_DISMISSED_KEY, value: 'true' });
    } catch (error) {
      console.error('Saving the push card dismissal failed', error);
    }
  }

  /**
   * Opens the app's notification settings, once the OS won't prompt again.
   * The resume check picks up a change made there.
   */
  async openSettings(): Promise<void> {
    try {
      await NativeSettings.open({
        optionAndroid: AndroidSettings.AppNotification,
        optionIOS: IOSSettings.AppNotification,
      });
    } catch (error) {
      console.error('Opening notification settings failed', error);
    }
  }

  private async refreshPermission(): Promise<void> {
    try {
      const { receive } = await FirebaseMessaging.checkPermissions();
      this.permissionState.set(await withAppSwitch(receive));
    } catch (error) {
      console.error('Checking push permission failed', error);
      return;
    }
    await this.fetchToken();
  }

  /** Asks FCM for the token once permission is granted, and registers it. */
  private async fetchToken(): Promise<void> {
    if (this.permissionState() !== 'granted') {
      return;
    }
    try {
      const { token } = await FirebaseMessaging.getToken();
      await this.registration.setToken(token);
    } catch (error) {
      console.error('Getting the push token failed', error);
    }
  }
}

/**
 * The messaging plugin answers "granted" on Android 12 and lower without
 * checking, so a user who turned notifications off in Settings would still
 * read as allowed. Android's own switch for the app decides there.
 */
async function withAppSwitch(
  receive: PermissionState
): Promise<PermissionState> {
  if (receive !== 'granted' || Capacitor.getPlatform() !== 'android') {
    return receive;
  }
  const { enabled } = await NotificationState.check();
  return enabled ? 'granted' : 'denied';
}
