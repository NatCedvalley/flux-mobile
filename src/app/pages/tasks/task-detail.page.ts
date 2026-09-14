import { DatePipe } from '@angular/common';
import { Component, inject, input, resource } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonSpinner,
} from '@ionic/angular';
import { FLUX_API } from '../../providers/flux-api.token';

@Component({
  selector: 'app-task-detail',
  templateUrl: './task-detail.page.html',
  styleUrls: ['./task-detail.page.scss'],
  imports: [
    DatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonSpinner,
  ],
})
export class TaskDetailPage {
  private readonly api = inject(FLUX_API);

  // Bound to the ':id' route param via withComponentInputBinding().
  readonly id = input.required<string>();

  protected readonly task = resource({
    params: () => this.id(),
    loader: ({ params }) => this.api.getTask(params),
  });
}
