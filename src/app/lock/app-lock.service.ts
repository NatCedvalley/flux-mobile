import {
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { AppLock } from '@core/lock';
import { AuthService } from '../auth/auth.service';

/** Not a secret, so it lives in Preferences rather than secure storage. */
const PREFERENCE_KEY = 'biometricUnlock';

/**
 * Whether the prompt may fall back to the device passcode. Not on Android 10
 * or lower: its passcode screen (Settings' ConfirmDeviceCredential) cancels
 * the app's check as it opens, then drops the accepted PIN, so the fallback
 * could never unlock. Those phones use biometrics or the password sign-in.
 */
function allowsPasscodeFallback(): boolean {
  const android = /Android (\d+)/.exec(navigator.userAgent);
  return !android || Number(android[1]) > 10;
}

/**
 * Angular face of `AppLock`: the Settings toggle, the biometric prompt, and
 * the app lifecycle events that decide when to lock. Native only: on web the
 * lock is never available, since tokens don't outlive a reload there.
 */
@Injectable({ providedIn: 'root' })
export class AppLockService {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly lock = new AppLock();
  private readonly state = signal(this.lock.state);
  private readonly availability = signal(false);
  private readonly preference = signal(false);
  /** Android shows the prompt in its own activity, which pauses the app. */
  private authenticating = false;

  /** The device has biometrics enrolled that the app can use. */
  readonly available = this.availability.asReadonly();
  /** The user's choice in Settings, kept across logouts. */
  readonly enabled = this.preference.asReadonly();
  /** Whether to show the lock screen: only a signed-in session is guarded. */
  readonly locked = computed(
    () => this.state().locked && this.auth.isSignedIn()
  );

  constructor() {
    this.lock.onChange((state) => this.state.set(state));
  }

  /**
   * Runs once at startup, before the first route renders, and locks the app
   * if the user turned the lock on. Never rejects: a failure leaves it off.
   */
  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      const [{ value }] = await Promise.all([
        Preferences.get({ key: PREFERENCE_KEY }),
        this.checkAvailability(),
      ]);
      this.preference.set(value === 'true');
    } catch (error) {
      console.error('Loading the biometric unlock setting failed', error);
    }
    this.apply();
    this.lock.lock();

    void App.addListener('pause', () => {
      if (!this.authenticating) {
        this.lock.background();
      }
    });
    void App.addListener('resume', () => void this.onResume());

    // Once signed out, forget the lock, so the next password sign-in isn't
    // met by the lock screen. Watched only after the cold-start restore:
    // until then, signed out just means not restored yet.
    void this.auth.restore().then(() =>
      effect(
        () => {
          if (!this.auth.isSignedIn()) {
            this.lock.unlock();
          }
        },
        { injector: this.injector }
      )
    );
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.preference.set(enabled);
    this.apply();
    await Preferences.set({ key: PREFERENCE_KEY, value: String(enabled) });
  }

  /**
   * Prompts for biometrics, or the device passcode as a fallback where it
   * works, and unlocks on success. A cancel or failure leaves the app locked.
   */
  async authenticate(): Promise<void> {
    if (this.authenticating) {
      return;
    }
    this.authenticating = true;
    try {
      await BiometricAuth.authenticate({
        reason: 'Unlock Flux',
        androidTitle: 'Unlock Flux',
        cancelTitle: 'Cancel',
        allowDeviceCredential: allowsPasscodeFallback(),
      });
      this.lock.unlock();
    } catch {
      // Cancelled, failed or locked out: the lock screen offers a retry and
      // signing in with the password.
    } finally {
      this.authenticating = false;
    }
  }

  private async onResume(): Promise<void> {
    // Lock first, so the tabs never show while availability is re-checked.
    this.lock.foreground();
    // Enrolment can change while the app is in the background. Removing it
    // takes the device passcode, so without biometrics the lock stands down.
    await this.checkAvailability();
    this.apply();
  }

  private async checkAvailability(): Promise<void> {
    try {
      const { isAvailable } = await BiometricAuth.checkBiometry();
      this.availability.set(isAvailable);
    } catch (error) {
      console.error('Checking biometrics failed', error);
    }
  }

  private apply(): void {
    this.lock.setEnabled(this.preference() && this.availability());
  }
}
