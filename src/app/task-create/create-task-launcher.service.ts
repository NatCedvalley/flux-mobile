import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { ModalController } from '@ionic/angular';
import type { MyProject, Task, WorkflowStatus } from '@core/api';
import { StatusBarService } from '../status-bar/status-bar.service';
import { CreateTaskSheetComponent } from './create-task-sheet/create-task-sheet.component';

/** What opening the create sheet needs from the page it's opened on. */
export type CreateTaskOptions = {
  /** The projects the caller may create in (EDITOR+). */
  projects: readonly MyProject[];
  /** The project the sheet starts in. */
  projectId: string;
  /**
   * The board column the sheet was opened from: the page moves each task
   * there after it's created, and the callout says so.
   */
  status?: WorkflowStatus;
  /** Called after each create, so the page can show the new task. */
  created: (task: Task) => void;
  /** Opens task detail, from the success toast's Open. */
  openTask: (task: Task) => void;
};

/**
 * Opens the create sheet (handoff 3i) from the app root rather than inline
 * in a page: the page behind it gets the iOS card effect, which would
 * scale a modal declared inside it too. While it's open the status bar's
 * text is light and, on iOS, the native keyboard accessory bar is hidden
 * for the sheet's own.
 */
@Injectable({ providedIn: 'root' })
export class CreateTaskLauncherService {
  private readonly modals = inject(ModalController);
  private readonly statusBar = inject(StatusBarService);

  async open(options: CreateTaskOptions): Promise<void> {
    const modal = await this.modals.create({
      component: CreateTaskSheetComponent,
      componentProps: options,
      cssClass: 'flux-create-sheet',
      // The app's root outlet, a sibling of the modal: the whole app,
      // tab bar included, steps back behind the sheet.
      presentingElement:
        document.querySelector<HTMLElement>('ion-app > ion-router-outlet') ??
        undefined,
    });
    this.statusBar.forceDark(true);
    void setAccessoryBar(false);
    void modal.onDidDismiss().then(() => {
      this.statusBar.forceDark(false);
      void setAccessoryBar(true);
    });
    await modal.present();
  }
}

/** Shows or hides iOS's keyboard accessory bar; only iOS implements it. */
async function setAccessoryBar(visible: boolean): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') {
    return;
  }
  try {
    await Keyboard.setAccessoryBarVisible({ isVisible: visible });
  } catch (error) {
    console.error('Setting the keyboard accessory bar failed', error);
  }
}
