import { Component, computed, inject, signal } from '@angular/core';
import { IonIcon, IonModal } from '@ionic/angular';
import { FluxSheetDirective } from '../../shared/flux-sheet.directive';
import { ConnectivityService } from '../connectivity.service';
import { changeCount } from '../pending-changes';
import { PendingChangesSheetComponent } from '../pending-changes-sheet/pending-changes-sheet.component';
import { WriteQueueService } from '../write-queue.service';

/** What the band says, and whether it opens the pending changes. */
type Band = { icon: string; text: string; opens: boolean };

/**
 * The handoff's offline banner: a 28px amber band that pages put last in
 * their `ion-header`. Offline it says so, with how many changes wait in the
 * queue; back online it stays while any of them needs attention (a
 * conflict or a refusal). With changes listed, a tap opens the pending
 * changes sheet.
 */
@Component({
  selector: 'app-offline-banner',
  templateUrl: './offline-banner.component.html',
  styleUrls: ['./offline-banner.component.scss'],
  imports: [
    IonIcon,
    IonModal,
    FluxSheetDirective,
    PendingChangesSheetComponent,
  ],
  host: { role: 'status' },
})
export class OfflineBannerComponent {
  private readonly connectivity = inject(ConnectivityService);
  private readonly writeQueue = inject(WriteQueueService);

  protected readonly open = signal(false);

  protected readonly band = computed<Band | undefined>(() => {
    if (!this.connectivity.online()) {
      const waiting = this.writeQueue.waiting();
      return waiting
        ? {
            icon: 'cloud-off',
            text: `Offline · ${changeCount(waiting)} waiting`,
            opens: true,
          }
        : {
            icon: 'cloud-off',
            text: 'Offline · showing cached work',
            opens: false,
          };
    }
    const attention = this.writeQueue.attention();
    return attention
      ? {
          icon: 'info',
          text: `${changeCount(attention)} ${attention === 1 ? 'needs' : 'need'} attention`,
          opens: true,
        }
      : undefined;
  });
}
