import { Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';

/**
 * Whether the device has a connection, as the OS reports it (the browser's
 * online/offline events on web). The offline banner shows it, and the read
 * cache and write queue act on it.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  // Online until the first check says otherwise, so nothing flashes.
  private readonly state = signal(true);
  readonly online = this.state.asReadonly();

  private markReady!: () => void;
  /** Resolves once the first check has answered (or failed). */
  readonly ready = new Promise<void>((resolve) => (this.markReady = resolve));

  /**
   * Runs once at startup, awaited, so a cold start that's already offline
   * knows before the first screen renders. Never rejects.
   */
  async init(): Promise<void> {
    void Network.addListener('networkStatusChange', ({ connected }) =>
      this.state.set(connected)
    );
    // A change made while the app was suspended may never have arrived.
    void App.addListener('resume', () => void this.check());
    await this.check();
    this.markReady();
  }

  /** Asks the OS. A failure keeps the last value. */
  private async check(): Promise<void> {
    try {
      const { connected } = await Network.getStatus();
      this.state.set(connected);
    } catch (error) {
      console.error('Checking the connection failed', error);
    }
  }
}
