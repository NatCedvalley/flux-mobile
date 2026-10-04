import { Component, input, output } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { GroupBy } from '@core/project-list';
import { SORT_OPTIONS } from '@core/task-filters';

/** The group-by choices, in flux-web's order. */
const GROUP_BY_OPTIONS: readonly { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'Not grouped' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Type' },
];

/**
 * The project list's view options: how it is grouped and sorted. A tap
 * applies at once; the page saves the group-by and keeps the sort.
 */
@Component({
  selector: 'app-view-options-sheet',
  templateUrl: './view-options-sheet.component.html',
  styleUrls: ['../../shared/sheet.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
  ],
  host: { class: 'ion-page' },
})
export class ViewOptionsSheetComponent {
  readonly groupBy = input.required<GroupBy>();
  readonly sort = input.required<string>();

  readonly groupByChange = output<GroupBy>();
  readonly sortChange = output<string>();
  readonly done = output();

  protected readonly groupByOptions = GROUP_BY_OPTIONS;
  protected readonly sortOptions = SORT_OPTIONS;
}
