import { Component, output } from '@angular/core';
import { IonFab, IonFabButton, IonIcon } from '@ionic/angular';

/**
 * The lists' create button (handoff: 56×56, radius 18, `--p9`, a 24px plus,
 * bottom end above the tab bar). Pages place it in their `ion-content`'s
 * fixed slot and show it only to an EDITOR+.
 */
@Component({
  selector: 'app-create-task-fab',
  templateUrl: './create-task-fab.component.html',
  styleUrls: ['./create-task-fab.component.scss'],
  imports: [IonFab, IonFabButton, IonIcon],
})
export class CreateTaskFabComponent {
  readonly opened = output();
}
