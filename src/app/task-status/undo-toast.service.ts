import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';

/** How long Undo is offered (handoff: a 4 s toast). */
const UNDO_MS = 4000;

/**
 * The Undo toast that status changes, archiving and reschedules offer. Only
 * one is on screen at a time: a new one, or an error, replaces it.
 */
@Injectable({ providedIn: 'root' })
export class UndoToastService {
  private readonly toasts = inject(ToastController);
  private toast: HTMLIonToastElement | undefined;

  /** A toast with Undo, replacing any Undo still on screen. */
  async offer(
    message: string,
    anchor: HTMLElement | string | undefined,
    undo: () => Promise<unknown>
  ): Promise<void> {
    this.dismiss();
    const toast = await this.toasts.create({
      message,
      duration: UNDO_MS,
      position: 'bottom',
      positionAnchor: anchor,
      buttons: [{ text: 'Undo', handler: () => void undo() }],
    });
    this.toast = toast;
    await toast.present();
  }

  /** Takes down the Undo on screen, if any. */
  dismiss(): void {
    void this.toast?.dismiss();
  }
}
