import { Component, inject, signal } from '@angular/core';
import {
  AlertController,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonToggle,
} from '@ionic/angular';
import { buildInfo } from '../../../environments/build-info';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { AppLockService } from '../../lock/app-lock.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonToggle,
  ],
})
export class SettingsPage {
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(AlertController);
  private readonly lock = inject(AppLockService);

  protected readonly account = this.auth.account;
  protected readonly environmentName = environment.name;
  protected readonly appVersion = buildInfo.version;
  protected readonly commit = buildInfo.commit;
  protected readonly loggingOut = signal(false);
  /** Only offered when the device has biometrics enrolled. */
  protected readonly biometricsAvailable = this.lock.available;
  protected readonly biometricUnlock = this.lock.enabled;

  protected setBiometricUnlock(enabled: boolean): Promise<void> {
    return this.lock.setEnabled(enabled);
  }

  /** AuthService opens /login once the session is gone. */
  protected async confirmLogout(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Log out of Flux?',
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
