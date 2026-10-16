import { Component, computed, inject, resource } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonTitle,
  IonToggle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { ApiError } from '@core/auth';
import {
  PUSH_PREFERENCE_SECTIONS,
  type PushPreferenceGroup,
  groupChange,
  groupEnabled,
  groupValues,
  withPreferences,
} from '@core/push';
import { FLUX_API } from '../../providers/flux-api.token';
import { PushService } from '../../push/push.service';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { SkeletonRowsComponent } from '../../shared/skeleton-rows/skeleton-rows.component';

const ERROR_MS = 3000;

/** What the page says about the OS permission. */
type PermissionView = 'web' | 'unavailable' | 'prompt' | 'denied' | 'granted';

/**
 * Settings → Notifications: the OS permission, with Turn on or Open
 * settings, and which push types reach this phone. The toggles are the
 * caller's server-side push preferences, so they follow the account to
 * every phone, and they only filter pushes: the Inbox lists everything.
 */
@Component({
  selector: 'app-notification-settings',
  templateUrl: './notification-settings.page.html',
  styleUrls: ['./notification-settings.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonButton,
    IonToggle,
    ErrorStateComponent,
    SkeletonRowsComponent,
  ],
})
export class NotificationSettingsPage {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);
  protected readonly push = inject(PushService);

  protected readonly sections = PUSH_PREFERENCE_SECTIONS;
  protected readonly preferences = resource({
    loader: () => this.api.pushPreferences(),
  });

  /** Null while PushService is still reading the permission. */
  protected readonly permission = computed<PermissionView | null>(() => {
    if (!Capacitor.isNativePlatform()) {
      return 'web';
    }
    if (!this.push.available) {
      return 'unavailable';
    }
    const permission = this.push.permission();
    return permission === 'prompt' || permission === 'prompt-with-rationale'
      ? 'prompt'
      : permission;
  });

  protected readonly granted = computed(() => this.permission() === 'granted');

  protected enabled(group: PushPreferenceGroup): boolean {
    return groupEnabled(group, this.preferences.value() ?? []);
  }

  /**
   * Shows the change at once and saves it. The response isn't applied, so
   * a toggle saved meanwhile isn't undone; a failure puts back only this
   * group's types.
   */
  protected async toggle(
    group: PushPreferenceGroup,
    enabled: boolean
  ): Promise<void> {
    const before = groupValues(group, this.preferences.value() ?? []);
    const change = groupChange(group, enabled);
    this.preferences.value.update((p) => withPreferences(p ?? [], change));
    try {
      await this.api.updatePushPreferences(change);
    } catch (error) {
      this.preferences.value.update((p) => withPreferences(p ?? [], before));
      const toast = await this.toasts.create({
        message:
          error instanceof ApiError && error.body.message
            ? error.body.message
            : 'Couldn’t save your notification settings.',
        duration: ERROR_MS,
        position: 'bottom',
      });
      await toast.present();
    }
  }
}
