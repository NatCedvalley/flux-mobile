import { Injectable, Injector, effect, inject, untracked } from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
} from '@angular/router';
import {
  ConsentStatus,
  ConsentType,
  FirebaseAnalytics,
} from '@capacitor-firebase/analytics';
import { type AnalyticsEvent, screenName } from '@core/analytics';
import { environment } from '../../environments/environment';
import {
  firebaseReportingEnabled,
  hasFirebaseConfig,
} from '../firebase/firebase-config';
import { ConnectivityService } from '../offline/connectivity.service';

/** Denied before collection starts: the app's usage is never for ads. */
const AD_CONSENT = [
  ConsentType.AdStorage,
  ConsentType.AdUserData,
  ConsentType.AdPersonalization,
] as const;

/**
 * Usage analytics with Firebase Analytics (FM-64): screen views by route
 * pattern, and the small set of events in `AnalyticsEvent`. No user id and
 * no content, only counts.
 *
 * On under the same gate as crash reporting: staging and production builds
 * that have the platform's Firebase config file. Collection is off natively
 * (AndroidManifest.xml, Info.plist) until `init()` turns it on, and on web
 * the plugin is never called.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly router = inject(Router);
  private readonly connectivity = inject(ConnectivityService);
  private readonly injector = inject(Injector);

  /** Whether usage is sent from this build. */
  readonly enabled = firebaseReportingEnabled();

  /** Whether collection is on, once `init()` has set it up. */
  private on: Promise<boolean> = Promise.resolve(false);

  /** Runs once at startup. Never rejects: a failure leaves analytics off. */
  async init(): Promise<void> {
    this.on = this.setUp();
    if (!this.enabled) {
      await this.on;
      return;
    }
    // Watched at once, so the first screen isn't missed while setting up.
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.screen();
      }
    });
    // After the first check, so a cold start that's already offline counts.
    void this.connectivity.ready.then(() =>
      effect(
        () => {
          if (!this.connectivity.online()) {
            untracked(
              () => void this.log({ name: 'offline_start', params: {} })
            );
          }
        },
        { injector: this.injector }
      )
    );
    await this.on;
  }

  /** Logs `event`. A no-op while off; a failure is only logged. */
  async log(event: AnalyticsEvent): Promise<void> {
    if (!(await this.on)) {
      return;
    }
    try {
      await FirebaseAnalytics.logEvent(event);
    } catch (error) {
      console.error('Logging a usage event failed', error);
    }
  }

  private async setUp(): Promise<boolean> {
    if (!hasFirebaseConfig()) {
      return false;
    }
    try {
      if (this.enabled) {
        // These outrank the native defaults, which Firebase was seen to
        // override (non_personalized_ads back to 0 on a Redmi).
        for (const type of AD_CONSENT) {
          await FirebaseAnalytics.setConsent({
            type,
            status: ConsentStatus.Denied,
          });
        }
      }
      // The switch is kept on the device, so a dev build installed over a
      // staging one turns it back off.
      await FirebaseAnalytics.setEnabled({ enabled: this.enabled });
      if (!this.enabled) {
        return false;
      }
      // The project is shared with flux-web; this tells staging from prod.
      await FirebaseAnalytics.setUserProperty({
        key: 'environment',
        value: environment.name,
      });
      return true;
    } catch (error) {
      console.error('Setting up analytics failed', error);
      return false;
    }
  }

  /** Logs the screen just navigated to, by its routes' patterns. */
  private screen(): void {
    const paths: (string | undefined)[] = [];
    let route: ActivatedRouteSnapshot | null =
      this.router.routerState.snapshot.root;
    while (route) {
      paths.push(route.routeConfig?.path);
      route = route.firstChild;
    }
    const name = screenName(paths);
    if (!name) {
      return;
    }
    void this.on.then(async (on) => {
      if (!on) {
        return;
      }
      try {
        await FirebaseAnalytics.setCurrentScreen({ screenName: name });
      } catch (error) {
        console.error('Logging a screen failed', error);
      }
    });
  }
}
