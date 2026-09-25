/**
 * How long the app may sit in the background before resuming it locks.
 * Long enough that a quick app switch (e.g. to copy a code) never prompts.
 */
export const LOCK_TIMEOUT_MS = 5 * 60_000;

export type LockState = {
  /** The user turned the lock on and the device can use biometrics. */
  enabled: boolean;
  locked: boolean;
};

/**
 * When the app should ask for biometrics again: on every cold start, and on
 * a resume after `LOCK_TIMEOUT_MS` in the background. Framework-agnostic;
 * src/app wraps it in signals and does the prompting.
 *
 * The lock only gates local access to the stored session. It never touches
 * the tokens or the server.
 */
export class AppLock {
  private enabled = false;
  private locked = false;
  private backgroundedAt: number | null = null;
  private readonly listeners = new Set<(state: LockState) => void>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  get state(): LockState {
    return { enabled: this.enabled, locked: this.locked };
  }

  onChange(listener: (state: LockState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Turning the lock off also unlocks. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.locked = false;
      this.backgroundedAt = null;
    }
    this.emit();
  }

  /** Locks straight away if enabled, as on a cold start. */
  lock(): void {
    if (this.enabled && !this.locked) {
      this.locked = true;
      this.emit();
    }
  }

  /** Call when the app goes to the background. */
  background(): void {
    if (this.enabled) {
      this.backgroundedAt = this.now();
    }
  }

  /** Call when the app returns: locks if it was away long enough. */
  foreground(): void {
    const since = this.backgroundedAt;
    this.backgroundedAt = null;
    if (since !== null && this.now() - since >= LOCK_TIMEOUT_MS) {
      this.lock();
    }
  }

  unlock(): void {
    if (this.locked) {
      this.locked = false;
      this.emit();
    }
  }

  private emit(): void {
    const state = this.state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
