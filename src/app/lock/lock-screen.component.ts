import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonText } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';
import { unsentChangesMessage } from '../offline/pending-changes';
import { WriteQueueService } from '../offline/write-queue.service';
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
  private readonly writeQueue = inject(WriteQueueService);

  protected readonly signingOut = signal(false);

  /**
   * What signing in with a password leaves unsent. A note rather than an
   * alert, which would open under this screen (it covers Ionic's overlays).
   */
  protected readonly unsent = computed(() => {
    const waiting = this.writeQueue.waiting();
    return waiting ? unsentChangesMessage(waiting) : undefined;
  });

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
