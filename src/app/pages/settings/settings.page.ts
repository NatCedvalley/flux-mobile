import { Component } from '@angular/core';
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

import { environment } from '../../../environments/environment';
import { buildInfo } from '../../../environments/build-info';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote],
})
export class SettingsPage {
  protected readonly environmentName = environment.name;
  protected readonly appVersion = buildInfo.version;
  protected readonly commit = buildInfo.commit;
}
