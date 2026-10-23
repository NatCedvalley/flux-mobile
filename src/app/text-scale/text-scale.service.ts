import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { TextZoom } from '@capacitor/text-zoom';
import { textScale } from '@core/text-scale';

/** Every type role and Ionic's rem base multiply by it (variables.scss). */
const SCALE_PROPERTY = '--flux-text-scale';

/**
 * Follows the OS text size (iOS Dynamic Type, Android's font size), up to
 * 120%, by setting --flux-text-scale on <html>. Native only: on web the
 * plugin is never called and the scale stays 1.
 */
@Injectable({ providedIn: 'root' })
export class TextScaleService {
  /**
   * Runs once at startup, awaited, so the first screen renders at the right
   * size, and again on every resume (iOS keeps running while the setting
   * changes; Android restarts the app). Never rejects.
   */
  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    void App.addListener('resume', () => void this.apply());
    await this.apply();
  }

  /** Reads the OS's size. A failure keeps the last scale. */
  private async apply(): Promise<void> {
    try {
      // Android's WebView scales px text by the system font size on its own,
      // without a limit; pin it, or the scale below would apply twice. iOS's
      // plugin has no set().
      if (Capacitor.getPlatform() === 'android') {
        await TextZoom.set({ value: 1 });
      }
      const { value } = await TextZoom.getPreferred();
      document.documentElement.style.setProperty(
        SCALE_PROPERTY,
        String(textScale(value))
      );
    } catch (error) {
      console.error('Reading the text size failed', error);
    }
  }
}
