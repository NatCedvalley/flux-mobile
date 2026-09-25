import { Component, inject, signal } from '@angular/core';
import { IonButton, IonText } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';
import { AppLockService } from './app-lock.service';

/**
 * Covers the app while it is locked, and prompts for biometrics as soon as
 * it appears. AppComponent shows it; unlocking or signing out hides it.
 */
@Component({
  selector: 'app-lock-screen',
  templateUrl: './lock-screen.component.html',
  styleUrls: ['./lock-screen.component.scss'],
  imports: [IonButton, IonText],
})
export class LockScreenComponent {
  private readonly lock = inject(AppLockService);
  private readonly auth = inject(AuthService);

  protected readonly signingOut = signal(false);

  constructor() {
    void this.unlock();
  }

  protected unlock(): Promise<void> {
    return this.lock.authenticate();
  }

  /** Drops the stored session; AuthService then opens /login. */
  protected async signInWithPassword(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.logout();
    } finally {
      this.signingOut.set(false);
    }
  }
}
