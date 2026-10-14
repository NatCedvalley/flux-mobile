import { Component, inject } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { PushService } from '../push.service';

/**
 * The Inbox's "Get notified on your phone" card: says what push will send,
 * and its button is the only thing that brings up the OS permission prompt.
 * The page shows it while `PushService.showCard()` is true.
 */
@Component({
  selector: 'app-push-card',
  templateUrl: './push-card.component.html',
  styleUrls: ['./push-card.component.scss'],
  imports: [IonButton, IonIcon],
})
export class PushCardComponent {
  protected readonly push = inject(PushService);
}
