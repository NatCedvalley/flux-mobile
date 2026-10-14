import { DatePipe } from '@angular/common';
import { Component, inject, resource } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonSpinner,
} from '@ionic/angular';
import { FLUX_API } from '../../providers/flux-api.token';
import { PushCardComponent } from '../../push/push-card/push-card.component';
import { PushService } from '../../push/push.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
  imports: [
    DatePipe,
    IonHeader,
    IonToolbar,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonSpinner,
    PushCardComponent,
  ],
})
export class NotificationsPage {
  private readonly api = inject(FLUX_API);
  protected readonly push = inject(PushService);

  protected readonly notifications = resource({
    loader: async () => (await this.api.listNotifications()).content ?? [],
  });
}
