import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { AuthClient, AuthSession } from '@core/auth';
import { environment } from '../../environments/environment';
import { AnalyticsService } from '../analytics/analytics.service';
import { ConnectivityService } from '../offline/connectivity.service';
import { TOKEN_STORE } from '../providers/token-store.token';

/**
 * Angular face of `AuthSession`: its state as signals, plus sign-in and
 * logout. Whenever the session ends, for whatever reason, it opens /login.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = new AuthSession(
    new AuthClient(environment.iamBaseUrl),
    inject(TOKEN_STORE)
  );
  private readonly router = inject(Router);
  private readonly connectivity = inject(ConnectivityService);
  private readonly analytics = inject(AnalyticsService);
  private readonly state = signal(this.session.state);
  private restoring?: Promise<void>;

  readonly isSignedIn = computed(() => this.state().isSignedIn);
  readonly account = computed(() => this.state().account);
  /** Why the last session ended, shown on the login page. */
  readonly endedMessage = computed(() => this.state().endedMessage);

  constructor() {
    this.session.onChange((state) => {
      const wasSignedIn = this.state().isSignedIn;
      this.state.set(state);
      if (wasSignedIn && !state.isSignedIn) {
        void this.router.navigateByUrl('/login', { replaceUrl: true });
      }
    });
    // Timers don't run while the app is suspended.
    void App.addListener('resume', () => void this.session.resume());
    // A session restored offline refreshes, and fetches its account, once
    // the connection is back.
    effect(() => {
      if (this.connectivity.online()) {
        untracked(() => void this.session.resume());
      }
    });
  }

  /**
   * Restores the stored session, once per app launch. Never rejects: an
   * unexpected failure leaves the user signed out and is retried next call.
   * Offline, it sends nothing, so the first screen isn't held up.
   */
  restore(): Promise<void> {
    this.restoring ??= this.connectivity.ready
      .then(() =>
        this.session.restore({ offline: !this.connectivity.online() })
      )
      .catch((error: unknown) => {
        console.error('Session restore failed', error);
        this.restoring = undefined;
      });
    return this.restoring;
  }

  /** Rejects with `ApiError` when the server refuses or can't be reached. */
  async login(email: string, password: string): Promise<void> {
    await this.session.login(email, password);
    void this.analytics.log({ name: 'login', params: { method: 'password' } });
  }

  /** Ends the session on the server where possible; always signs out here. */
  logout(): Promise<void> {
    return this.session.logout();
  }

  /** See `AuthSession.setBeforeLogout`. */
  setBeforeLogout(hook: (() => Promise<void>) | null): void {
    this.session.setBeforeLogout(hook);
  }

  /** See `AuthSession.withAccessToken`: the base for authenticated calls. */
  withAccessToken<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
    return this.session.withAccessToken(call);
  }
}
