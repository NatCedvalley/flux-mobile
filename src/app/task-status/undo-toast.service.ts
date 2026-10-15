import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';

/** How long Undo is offered (handoff: a 4 s toast). */
const UNDO_MS = 4000;

/**
 * The Undo toast that status changes, archiving, reschedules and the
 * Inbox's mark read offer. Only
 * one is on screen at a time: a new one, or an error, replaces it.
 */
@Injectable({ providedIn: 'root' })
export class UndoToastService {
  private readonly toasts = inject(ToastController);
  private toast: HTMLIonToastElement | undefined;

  /**
   * A toast with Undo, replacing any Undo still on screen. `onExpire` runs
   * once the toast goes without Undo: it timed out, or another toast or
   * `dismiss()` took it down. A change whose write waits for that (the
   * Inbox's mark read) sends it there.
   */
  async offer(
    message: string,
    anchor: HTMLElement | string | undefined,
    undo: () => Promise<unknown>,
    onExpire?: () => void
  ): Promise<void> {
    this.dismiss();
    let undone = false;
    const toast = await this.toasts.create({
      message,
      duration: UNDO_MS,
      position: 'bottom',
      positionAnchor: anchor,
      buttons: [
        {
          text: 'Undo',
          handler: () => {
            undone = true;
            void undo();
          },
        },
      ],
    });
    this.toast = toast;
    if (onExpire) {
      void toast.onDidDismiss().then(() => {
        if (!undone) {
          onExpire();
        }
      });
    }
    await toast.present();
  }

  /** Takes down the Undo on screen, if any. */
  dismiss(): void {
    void this.toast?.dismiss();
  }
}
