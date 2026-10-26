import { Injectable, Injector, effect, inject, signal } from '@angular/core';
import {
  Capacitor,
  SystemBarType,
  SystemBars,
  SystemBarsStyle,
} from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ThemeService } from '../theme/theme.service';

/**
 * Keeps the status bar's text readable over the app: dark text on the light
 * theme, light text on the dark one, following the theme in effect (the
 * OS's, or Settings' override). Only the style is set: on Android 16+ the
 * WebView always runs edge to edge (the plugin ignores `overlaysWebView` and
 * `backgroundColor`), and Ionic pads content by the safe-area insets on both
 * platforms. The navigation bar's buttons follow the theme the same way
 * (Capacitor's SystemBars): Android's own theme follows the OS, so Light
 * over a dark OS left light buttons on the white tab bar (FM-56). Native
 * only.
 */
@Injectable({ providedIn: 'root' })
export class StatusBarService {
  private readonly theme = inject(ThemeService);
  private readonly injector = inject(Injector);
  private readonly forced = signal(false);

  init(): void {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    effect(
      () =>
        // Style.Dark means light text, for dark backgrounds.
        void StatusBar.setStyle({
          style: this.forced() || this.theme.dark() ? Style.Dark : Style.Light,
        }).catch((error: unknown) =>
          console.error('Setting the status bar style failed', error)
        ),
      { injector: this.injector }
    );
    // Not forced: a card sheet covers the bottom of the screen, in the
    // theme's colours.
    effect(
      () =>
        void SystemBars.setStyle({
          style: this.theme.dark()
            ? SystemBarsStyle.Dark
            : SystemBarsStyle.Light,
          bar: SystemBarType.NavigationBar,
        }).catch((error: unknown) =>
          console.error('Setting the navigation bar style failed', error)
        ),
      { injector: this.injector }
    );
  }

  /**
   * Light text whatever the theme, while `on`: a card sheet (the create
   * sheet) pushes the page back over black. Off follows the theme again.
   */
  forceDark(on: boolean): void {
    this.forced.set(on);
  }
}
