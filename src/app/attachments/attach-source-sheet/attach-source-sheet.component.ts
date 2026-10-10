import { Component, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular';
import type { FileSource } from '../file-source.service';
import { AttachSourcesComponent } from '../attach-sources/attach-sources.component';

/**
 * Where to attach a file from, for the comment composer's and the create
 * sheet's paperclip. The page runs the choice once the sheet has closed,
 * so the native picker never opens over a closing sheet.
 */
@Component({
  selector: 'app-attach-source-sheet',
  templateUrl: './attach-source-sheet.component.html',
  styleUrls: ['./attach-source-sheet.component.scss'],
  imports: [IonButton, AttachSourcesComponent],
  host: { class: 'ion-page' },
})
export class AttachSourceSheetComponent {
  readonly sources = input.required<readonly FileSource[]>();
  /** Under the title, e.g. which task the file goes to. */
  readonly subtitle = input<string>();

  readonly picked = output<FileSource>();
  readonly done = output();
}
