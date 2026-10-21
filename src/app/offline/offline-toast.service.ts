import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';

/** What a screen says when something needs a connection. */
export const OFFLINE_MESSAGES = {
  refresh: 'You’re offline. Showing saved work.',
  loadMore: 'Loading more needs a connection.',
  openFile: 'Opening files needs a connection.',
  markRead: 'Marking read needs a connection.',
  edit: 'Editing needs a connection.',
  archive: 'Archiving needs a connection.',
  reschedule: 'Rescheduling needs a connection.',
  reorder: 'Reordering needs a connection.',
  create: 'Creating tasks needs a connection.',
  upload: 'Uploading files needs a connection.',
} as const;

/** A short toast for an action that needs a connection, worded alike everywhere. */
@Injectable({ providedIn: 'root' })
export class OfflineToastService {
  private readonly toasts = inject(ToastController);

  /** `anchor`: what the toast sits above (the tab bar, a docked bar). */
  async show(message: string, anchor?: string | HTMLElement): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: 2500,
      position: 'bottom',
      positionAnchor: anchor,
    });
    await toast.present();
  }
}
