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
import { PushRegistration } from '@core/push';
import { buildInfo } from '../../environments/build-info';
import { AuthService } from '../auth/auth.service';
import { FLUX_API } from '../providers/flux-api.token';

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
  private readonly permission = signal<PermissionState | null>(null);
  private readonly dismissed = signal(false);

  /**
   * Whether the Inbox shows the card: only while the OS would still prompt.
   * Once allowed or denied, the card has nothing left to offer.
   */
  readonly showCard = computed(() => {
    const permission = this.permission();
    return (
      (permission === 'prompt' || permission === 'prompt-with-rationale') &&
      !this.dismissed()
    );
  });

  /** Runs once at startup. Never rejects: a failure leaves push off. */
  async init(): Promise<void> {
    if (!isAvailable()) {
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
      this.permission.set(receive);
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

  /** The card's button: the only place the OS permission prompt appears. */
  async enable(): Promise<void> {
    try {
      const { receive } = await FirebaseMessaging.requestPermissions();
      this.permission.set(receive);
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

  private async refreshPermission(): Promise<void> {
    try {
      const { receive } = await FirebaseMessaging.checkPermissions();
      this.permission.set(receive);
    } catch (error) {
      console.error('Checking push permission failed', error);
      return;
    }
    await this.fetchToken();
  }

  /** Asks FCM for the token once permission is granted, and registers it. */
  private async fetchToken(): Promise<void> {
    if (this.permission() !== 'granted') {
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

function isAvailable(): boolean {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }
  return Capacitor.getPlatform() === 'ios'
    ? buildInfo.push.ios
    : buildInfo.push.android;
}
