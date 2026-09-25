import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { AuthClient, AuthSession } from '@core/auth';
import { environment } from '../../environments/environment';
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
  }

  /**
   * Restores the stored session, once per app launch. Never rejects: an
   * unexpected failure leaves the user signed out and is retried next call.
   */
  restore(): Promise<void> {
    this.restoring ??= this.session.restore().catch((error: unknown) => {
      console.error('Session restore failed', error);
      this.restoring = undefined;
    });
    return this.restoring;
  }

  /** Rejects with `ApiError` when the server refuses or can't be reached. */
  login(email: string, password: string): Promise<void> {
    return this.session.login(email, password);
  }

  /** Ends the session on the server where possible; always signs out here. */
  logout(): Promise<void> {
    return this.session.logout();
  }

  /** See `AuthSession.withAccessToken`: the base for authenticated calls. */
  withAccessToken<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
    return this.session.withAccessToken(call);
  }
}
