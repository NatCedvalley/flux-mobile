import { Component, input, output } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';

export type OverflowAction =
  'archive' | 'delete' | 'link' | 'parent' | 'reassign' | 'watch';

/**
 * The task overflow sheet (3n): Reassign, Change parent, Copy link, the
 * watch toggle and Archive, then Delete apart in red. Each row shows only
 * when the caller's role allows it; the page runs the chosen action once
 * the sheet has closed.
 */
@Component({
  selector: 'app-task-overflow-sheet',
  templateUrl: './task-overflow-sheet.component.html',
  styleUrls: [
    '../../../shared/sheet.scss',
    './task-overflow-sheet.component.scss',
  ],
  imports: [IonList, IonItem, IonLabel, IonIcon, IonButton],
  host: { class: 'ion-page' },
})
export class TaskOverflowSheetComponent {
  readonly taskKey = input<string>();
  readonly title = input<string>();
  /** The assignee summary Reassign shows, e.g. `Ada Rahman +1`. */
  readonly assignee = input<string>();
  /** Undefined until the subscription has loaded. */
  readonly watching = input<boolean>();
  readonly commentCount = input<number>();
  readonly canReassign = input(false);
  readonly canEdit = input(false);
  readonly canArchive = input(false);
  readonly canDelete = input(false);

  readonly action = output<OverflowAction>();
  readonly done = output();
}
