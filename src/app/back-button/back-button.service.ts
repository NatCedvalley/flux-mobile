import { Injectable, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NavController, Platform } from '@ionic/angular';

/**
 * Android's Back gesture and button: go back a page in the current tab's
 * stack, and leave the app when there is nothing to go back to (a tab's
 * first screen, or the login page). Ionic's own handler only pops the
 * stack, so without this Back did nothing on a tab root. Android only: iOS
 * has no Back button, and the plugin can't exit an iOS app.
 */
@Injectable({ providedIn: 'root' })
export class BackButtonService {
  private readonly platform = inject(Platform);
  private readonly nav = inject(NavController);

  init(): void {
    if (Capacitor.getPlatform() !== 'android') {
      return;
    }
    // Priority 1 runs before NavController's own pop handler (0) and after
    // overlays (100) and menus (99), so Back still closes an open alert or
    // sheet first. Not calling processNextHandler keeps Ionic's handler from
    // popping a second time.
    this.platform.backButton.subscribeWithPriority(1, async () => {
      if (!(await this.nav.pop())) {
        await App.exitApp();
      }
    });
  }
}
