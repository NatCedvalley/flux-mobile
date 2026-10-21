import { Component, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { ConnectivityService } from '../connectivity.service';

/**
 * The handoff's offline banner: a 28px amber band that pages put last in
 * their `ion-header`, shown while `ConnectivityService.online()` is false.
 */
@Component({
  selector: 'app-offline-banner',
  templateUrl: './offline-banner.component.html',
  styleUrls: ['./offline-banner.component.scss'],
  imports: [IonIcon],
})
export class OfflineBannerComponent {
  protected readonly connectivity = inject(ConnectivityService);
}
