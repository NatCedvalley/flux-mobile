import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * Keeps the status bar's text readable over the app: dark text on the light
 * theme, light text on the dark one, following the OS setting as the theme
 * does. Only the style is set: on Android 16+ the WebView always runs edge
 * to edge (the plugin ignores `overlaysWebView` and `backgroundColor`), and
 * Ionic pads content by the safe-area insets on both platforms. Native only.
 */
@Injectable({ providedIn: 'root' })
export class StatusBarService {
  init(): void {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      // Style.Dark means light text, for dark backgrounds.
      StatusBar.setStyle({
        style: dark.matches ? Style.Dark : Style.Light,
      }).catch((error: unknown) =>
        console.error('Setting the status bar style failed', error)
      );
    void apply();
    dark.addEventListener('change', () => void apply());
  }
}
