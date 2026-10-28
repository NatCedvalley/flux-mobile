import { Injectable, Injector, effect, inject } from '@angular/core';
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';
import { App } from '@capacitor/app';
import { crashKeys, exceptionReport } from '@core/crash';
import { buildInfo } from '../../environments/build-info';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  firebaseReportingEnabled,
  hasFirebaseConfig,
} from '../firebase/firebase-config';

/**
 * Crash reporting with Firebase Crashlytics: native crashes, and the JS
 * errors `CrashErrorHandler` hands to `record()`.
 *
 * On only in staging and production builds that have the platform's
 * Firebase config file, the same gate as push. Collection is off natively
 * (AndroidManifest.xml, Info.plist) until `init()` turns it on, and on web
 * the plugin is never called.
 */
@Injectable({ providedIn: 'root' })
export class CrashReportingService {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  /** Whether reports are sent from this build. */
  readonly enabled = firebaseReportingEnabled();

  /** Runs once at startup. Never rejects: a failure leaves reports off. */
  async init(): Promise<void> {
    if (!hasFirebaseConfig()) {
      return;
    }
    try {
      // The switch is kept on the device, so a dev build installed over a
      // staging one turns it back off.
      await FirebaseCrashlytics.setEnabled({ enabled: this.enabled });
      if (!this.enabled) {
        return;
      }
      const { build } = await App.getInfo();
      const keys = crashKeys({
        environment: environment.name,
        version: buildInfo.version,
        build,
        commit: buildInfo.commit,
      });
      await Promise.all(
        keys.map((key) => FirebaseCrashlytics.setCustomKey(key))
      );
    } catch (error) {
      console.error('Setting up crash reporting failed', error);
      return;
    }

    // The account's UUID only, never a name or email. Watched after the
    // cold-start restore, as push does; an empty id clears it.
    void this.auth.restore().then(() =>
      effect(
        () => {
          const userId = this.auth.account()?.id ?? '';
          FirebaseCrashlytics.setUserId({ userId }).catch((error: unknown) =>
            console.error('Setting the crash reporting user failed', error)
          );
        },
        { injector: this.injector }
      )
    );
  }

  /** Sends a JS error. A failure is only logged, so it can't loop. */
  async record(error: unknown): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      await FirebaseCrashlytics.recordException(exceptionReport(error));
    } catch (failure) {
      console.error('Recording an error failed', failure);
    }
  }
}
