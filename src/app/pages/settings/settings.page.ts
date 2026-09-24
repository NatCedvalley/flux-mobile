import { Component, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
} from '@ionic/angular';
import { buildInfo } from '../../../environments/build-info';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

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
  ],
})
export class SettingsPage {
  protected readonly account = inject(AuthService).account;
  protected readonly environmentName = environment.name;
  protected readonly appVersion = buildInfo.version;
  protected readonly commit = buildInfo.commit;
}
