import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/** Not secrets, so they live in Preferences (localStorage on web). */
const PINNED_KEY = 'projects.pinned';
const LAST_KEY = 'projects.last';

/**
 * The Projects tab's on-device memory: which projects are pinned (the
 * backend has no pinning) and which one was open last. Kept across logouts.
 */
@Injectable({ providedIn: 'root' })
export class ProjectPrefsService {
  private readonly pinnedIds = signal<string[]>([]);
  private loading: Promise<void> | undefined;

  /** Pinned project ids, oldest pin first. */
  readonly pinned = this.pinnedIds.asReadonly();

  /** Reads the pins once; later calls share the first read. Never rejects. */
  load(): Promise<void> {
    this.loading ??= Preferences.get({ key: PINNED_KEY })
      .then(({ value }) => {
        const ids: unknown = value ? JSON.parse(value) : [];
        if (Array.isArray(ids)) {
          this.pinnedIds.set(ids.filter((id) => typeof id === 'string'));
        }
      })
      .catch((error: unknown) => {
        console.error('Loading pinned projects failed', error);
      });
    return this.loading;
  }

  async togglePin(projectId: string): Promise<void> {
    const pinned = this.pinnedIds();
    this.pinnedIds.set(
      pinned.includes(projectId)
        ? pinned.filter((id) => id !== projectId)
        : [...pinned, projectId]
    );
    await Preferences.set({
      key: PINNED_KEY,
      value: JSON.stringify(this.pinnedIds()),
    });
  }

  /** The project open last, or null. Never rejects. */
  async lastProjectId(): Promise<string | null> {
    try {
      return (await Preferences.get({ key: LAST_KEY })).value;
    } catch (error) {
      console.error('Loading the last project failed', error);
      return null;
    }
  }

  async setLastProject(projectId: string): Promise<void> {
    await Preferences.set({ key: LAST_KEY, value: projectId });
  }
}
