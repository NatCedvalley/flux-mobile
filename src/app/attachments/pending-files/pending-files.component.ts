import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import type { PickedFile } from '../file-source.service';

/**
 * Files waiting to be attached, one per line with a remove button: the
 * create sheet's, uploaded once the task exists.
 */
@Component({
  selector: 'app-pending-files',
  templateUrl: './pending-files.component.html',
  styleUrls: ['./pending-files.component.scss'],
  imports: [IonIcon],
  host: { role: 'list', 'aria-label': 'Files to attach' },
})
export class PendingFilesComponent {
  readonly files = input.required<readonly PickedFile[]>();

  /** The index of the file removed. */
  readonly removed = output<number>();
}
