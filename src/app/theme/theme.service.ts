import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Not a secret, so it lives in Preferences (localStorage on web). */
const PREFERENCE_KEY = 'theme';
const CLASSES = {
  light: 'flux-theme-light',
  dark: 'flux-theme-dark',
} as const;

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * The theme choice in Settings, kept on this device only (the account has
 * no theme field). Light and Dark put a class on <html> that variables.scss
 * ranks above the OS's prefers-color-scheme; System puts none.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly choice = signal<ThemePreference>('system');
  private readonly osDark = signal(false);

  /** The user's choice, kept across restarts and logouts. */
  readonly preference = this.choice.asReadonly();
  /** Whether the theme in effect is dark. */
  readonly dark = computed(() => {
    const choice = this.choice();
    return choice === 'dark' || (choice === 'system' && this.osDark());
  });

  /**
   * Runs once at startup, before the first route renders, so the first
   * screen already has the chosen theme. Never rejects: a failure leaves
   * System.
   */
  async init(): Promise<void> {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    this.osDark.set(media.matches);
    media.addEventListener('change', () => this.osDark.set(media.matches));
    try {
      const { value } = await Preferences.get({ key: PREFERENCE_KEY });
      if (isPreference(value)) {
        this.choice.set(value);
      }
    } catch (error) {
      console.error('Loading the theme failed', error);
    }
    this.apply();
  }

  async set(preference: ThemePreference): Promise<void> {
    this.choice.set(preference);
    this.apply();
    await Preferences.set({ key: PREFERENCE_KEY, value: preference });
  }

  private apply(): void {
    const { classList } = document.documentElement;
    classList.toggle(CLASSES.light, this.choice() === 'light');
    classList.toggle(CLASSES.dark, this.choice() === 'dark');
  }
}
