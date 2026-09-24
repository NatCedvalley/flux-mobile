import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthClient, AuthSession } from '@core/auth';
import { environment } from '../../environments/environment';
import { TOKEN_STORE } from '../providers/token-store.token';

/** Angular face of `AuthSession`: its state as signals, plus sign-in. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = new AuthSession(
    new AuthClient(environment.iamBaseUrl),
    inject(TOKEN_STORE)
  );
  private readonly state = signal(this.session.state);
  private restoring?: Promise<void>;

  readonly isSignedIn = computed(() => this.state().isSignedIn);
  readonly account = computed(() => this.state().account);

  constructor() {
    this.session.onChange((state) => this.state.set(state));
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
}
