import { Component, input, output } from '@angular/core';
import { IonButton, IonFooter, IonIcon } from '@ionic/angular';
import type { WorkflowStatus } from '@core/api';

/**
 * Task detail's docked action bar (3e): a comment button and, for an
 * EDITOR+, "Move to <next status>" (or "Change status" when there is no
 * next one). The page decides what each does.
 */
@Component({
  selector: 'app-task-action-bar',
  templateUrl: './task-action-bar.component.html',
  styleUrls: ['./task-action-bar.component.scss'],
  imports: [IonFooter, IonButton, IonIcon],
})
export class TaskActionBarComponent {
  /** The next status in the project's workflow, if any. */
  readonly next = input<WorkflowStatus>();
  /** Whether the caller may change the status (the primary button). */
  readonly canMove = input(false);
  readonly moveDisabled = input(false);

  readonly comment = output();
  readonly move = output();
}
