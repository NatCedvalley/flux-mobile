import { Component } from '@angular/core';
import { IonSkeletonText } from '@ionic/angular';

/**
 * The Details tab while the task loads: its cards' shapes in `--na3`
 * blocks. Fades in after 200ms, as the list skeletons do, so a quick load
 * never flashes it.
 */
@Component({
  selector: 'app-task-details-skeleton',
  templateUrl: './task-details-skeleton.component.html',
  styleUrls: ['./task-details-skeleton.component.scss'],
  imports: [IonSkeletonText],
  host: { 'aria-busy': 'true', 'aria-label': 'Loading' },
})
export class TaskDetailsSkeletonComponent {}
