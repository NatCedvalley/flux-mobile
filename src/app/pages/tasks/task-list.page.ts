import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
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

/**
 * Projects tab. Until FM-29 builds the project list and switcher, it lists
 * the open tasks assigned to the user, across projects.
 */
@Component({
  selector: 'app-task-list',
  templateUrl: './task-list.page.html',
  styleUrls: ['./task-list.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonSpinner,
  ],
})
export class TaskListPage {
  private readonly api = inject(FLUX_API);

  protected readonly tasks = resource({
    loader: async () =>
      (
        await this.api.listMyTasks({
          scope: 'assigned',
          openOnly: true,
          size: 100,
        })
      ).content ?? [],
  });
}
