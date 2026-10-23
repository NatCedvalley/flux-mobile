import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AlertController,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonToggle,
  IonModal,
} from '@ionic/angular';
import { accountAvatar } from '@core/people';
import { AuthService } from '../../auth/auth.service';
import { AppLockService } from '../../lock/app-lock.service';
import { unsentChangesMessage } from '../../offline/pending-changes';
import { WriteQueueService } from '../../offline/write-queue.service';
import {
  PickerSheetComponent,
  type PickerItem,
} from '../../shared/picker-sheet/picker-sheet.component';
import { ThemeService, type ThemePreference } from '../../theme/theme.service';

const THEME_ITEMS: readonly (PickerItem & { id: ThemePreference })[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonToggle,
    IonModal,
    PickerSheetComponent,
    RouterLink,
  ],
})
export class SettingsPage {
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(AlertController);
  private readonly lock = inject(AppLockService);
  private readonly writeQueue = inject(WriteQueueService);
  protected readonly theme = inject(ThemeService);

  /**
   * The read-only profile header, without lines the account lacks. Editing
   * stays on the web.
   */
  protected readonly profile = computed(() => {
    const account = this.auth.account();
    if (!account) {
      return undefined;
    }
    const { initials, fillIndex } = accountAvatar(account);
    const fullName = [account.firstName?.trim(), account.lastName?.trim()]
      .filter(Boolean)
      .join(' ');
    const name = account.displayName?.trim() || fullName || account.email;
    return {
      initials,
      fill: `var(--flux-avatar-${fillIndex + 1})`,
      name,
      email: account.email !== name ? account.email : undefined,
      timezone: account.timezone,
    };
  });
  protected readonly loggingOut = signal(false);
  /** Only offered when the device has biometrics enrolled. */
  protected readonly biometricsAvailable = this.lock.available;
  protected readonly biometricUnlock = this.lock.enabled;

  protected readonly themeItems = THEME_ITEMS;
  protected readonly themeOpen = signal(false);
  protected readonly themeLabel = computed(
    () => THEME_ITEMS.find(({ id }) => id === this.theme.preference())?.label
  );

  /** Applies at once; the sheet closes on the pick. */
  protected pickTheme(id: string): void {
    const item = THEME_ITEMS.find((i) => i.id === id);
    if (item) {
      void this.theme.set(item.id);
    }
    this.themeOpen.set(false);
  }

  protected setBiometricUnlock(enabled: boolean): Promise<void> {
    return this.lock.setEnabled(enabled);
  }

  /**
   * AuthService opens /login once the session is gone. Changes still in the
   * queue stay for this account, and the alert says so.
   */
  protected async confirmLogout(): Promise<void> {
    const waiting = this.writeQueue.waiting();
    const alert = await this.alerts.create({
      header: 'Log out of Flux?',
      message: waiting ? unsentChangesMessage(waiting) : undefined,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Log out', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'confirm') {
      return;
    }
    this.loggingOut.set(true);
    try {
      await this.auth.logout();
    } finally {
      this.loggingOut.set(false);
    }
  }
}
