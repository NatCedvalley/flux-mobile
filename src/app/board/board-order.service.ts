import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { ApiError } from '@core/auth';
import { FLUX_API } from '../providers/flux-api.token';

const ERROR_MS = 3000;

/** Where the board shows a column's new order while it saves. */
export type OrderView = {
  /** Puts the column's old order back. */
  restore(): void;
  /** What the toast sits above (the tab bar's id). */
  anchor?: HTMLElement | string;
};

/**
 * Saves a board column's order (`PATCH .../tasks/reorder`), which the board
 * has already shown. The response leaves out assignees, so it isn't used. If
 * the server refuses, the old order comes back with the server's message.
 * An Undo already offered for the move that led here stays.
 */
@Injectable({ providedIn: 'root' })
export class BoardOrderService {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);

  /** Resolves with whether the server took it. */
  async save(
    projectId: string,
    taskIds: string[],
    view: OrderView
  ): Promise<boolean> {
    try {
      await this.api.reorderTasks(projectId, { taskIds });
      return true;
    } catch (error) {
      view.restore();
      const toast = await this.toasts.create({
        message:
          error instanceof ApiError && error.body.message
            ? error.body.message
            : 'Couldn’t save the order',
        duration: ERROR_MS,
        position: 'bottom',
        positionAnchor: view.anchor,
      });
      await toast.present();
      return false;
    }
  }
}
