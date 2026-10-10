import { Injectable, inject } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { ToastController } from '@ionic/angular';
import type { Attachment } from '@core/api';
import { uploadErrorMessage } from '@core/attachments';
import type { PickedFile } from './file-source.service';
import { FLUX_API } from '../providers/flux-api.token';

const TOAST_MS = 3000;

/** The task a file is attached to, and where its toasts sit. */
export type AttachmentTarget = {
  projectId: string;
  taskId: string;
  /** The docked footer the toasts sit above, if any. */
  anchor?: HTMLElement | string;
};

/**
 * Attachment uploads and opening from task detail. An upload resolves with
 * the server's attachment, or `undefined` once the failure has been shown as
 * a toast (the server's 422 message, or why it couldn't be sent).
 */
@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);

  async upload(
    target: AttachmentTarget,
    file: PickedFile
  ): Promise<Attachment | undefined> {
    let attachment: Attachment;
    try {
      attachment = await this.api.uploadTaskAttachment(
        target.projectId,
        target.taskId,
        file.blob,
        file.name
      );
    } catch (error) {
      await this.toast(uploadErrorMessage(error, file.name), target.anchor);
      return undefined;
    }
    await this.toast(`Attached ${file.name}`, target.anchor);
    return attachment;
  }

  /**
   * Opens the file inline: in the in-app browser on native, a new tab on
   * web. Its presigned URL needs no token.
   */
  async open(
    attachment: Attachment,
    anchor?: HTMLElement | string
  ): Promise<void> {
    const url = attachment.previewUrl;
    if (!url) {
      // The server couldn't sign one.
      await this.toast('This file isn’t available right now.', anchor);
      return;
    }
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  private async toast(
    message: string,
    anchor: HTMLElement | string | undefined
  ): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: TOAST_MS,
      position: 'bottom',
      positionAnchor: anchor,
    });
    await toast.present();
  }
}
