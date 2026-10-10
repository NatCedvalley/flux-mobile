import { Component, input, output } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';
import { FILE_SOURCES, type FileSource } from '../file-source.service';

/**
 * The rows that attach a file: Take photo, Choose photo and Choose file, as
 * the platform offers them. Shared by the attachments sheet and the source
 * sheet the composer and create sheet open.
 */
@Component({
  selector: 'app-attach-sources',
  templateUrl: './attach-sources.component.html',
  styleUrls: ['./attach-sources.component.scss'],
  imports: [IonList, IonItem, IonLabel, IonIcon],
})
export class AttachSourcesComponent {
  readonly sources = input.required<readonly FileSource[]>();
  /** While an upload runs, so a second one can't start. */
  readonly disabled = input(false);

  readonly picked = output<FileSource>();

  protected readonly labels = FILE_SOURCES;
}
