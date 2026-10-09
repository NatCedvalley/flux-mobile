import { Component, computed, input, output } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { Attachment, ProjectMember } from '@core/api';
import { attachmentIcon, fileSize, uploaderName } from '@core/attachments';
import { relativeTime } from '@core/task-detail';
import type { FileSource } from '../file-source.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { SkeletonRowsComponent } from '../../shared/skeleton-rows/skeleton-rows.component';
import { AttachSourcesComponent } from '../attach-sources/attach-sources.component';

type Row = {
  attachment: Attachment;
  thumbnail: string | undefined;
  icon: string;
  meta: string;
};

/**
 * A task's attachments, newest first: a thumbnail or type icon, the name,
 * and size · uploader · age. Tapping one asks the page to open it. With
 * `canAttach`, the sources to add one follow the list, and the file being
 * uploaded shows at the top.
 */
@Component({
  selector: 'app-attachments-sheet',
  templateUrl: './attachments-sheet.component.html',
  styleUrls: ['../../shared/sheet.scss', './attachments-sheet.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonSpinner,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonRowsComponent,
    AttachSourcesComponent,
  ],
  host: { class: 'ion-page' },
})
export class AttachmentsSheetComponent {
  /** Undefined while they load. */
  readonly attachments = input<Attachment[]>();
  /** Why they couldn't be loaded, if they couldn't. */
  readonly error = input<unknown>();
  /** The project's members, to name the uploaders. */
  readonly members = input<readonly ProjectMember[]>([]);
  readonly myId = input<string>();
  readonly now = input.required<Date>();
  readonly canAttach = input(false);
  readonly sources = input<readonly FileSource[]>([]);
  /** The name of the file being uploaded, if one is. */
  readonly uploading = input<string>();

  readonly opened = output<Attachment>();
  readonly attach = output<FileSource>();
  readonly retry = output();
  readonly done = output();

  protected readonly rows = computed(() =>
    this.attachments()?.map((attachment): Row => ({
      attachment,
      thumbnail: attachment.thumbnailUrl ?? undefined,
      icon: attachmentIcon(attachment.contentType),
      meta: [
        fileSize(attachment.fileSize),
        uploaderName(attachment.uploadedBy, this.members(), this.myId()),
        relativeTime(attachment.createdAt, this.now()),
      ]
        .filter(Boolean)
        .join(' · '),
    }))
  );
}
