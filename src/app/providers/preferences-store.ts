import { Preferences } from '@capacitor/preferences';
import type { CacheStore } from '@core/offline';

const PREFIX = 'write-queue/';

/**
 * Keeps the write queue's blobs in `@capacitor/preferences`, which the OS
 * never purges (unlike the Cache directory the read cache uses). They are
 * small: a few status changes per account. Native only.
 */
export class PreferencesStore implements CacheStore {
  async read(name: string): Promise<string | undefined> {
    try {
      const { value } = await Preferences.get({ key: PREFIX + name });
      return value ?? undefined;
    } catch {
      return undefined;
    }
  }

  async write(name: string, data: string): Promise<void> {
    await Preferences.set({ key: PREFIX + name, value: data });
  }

  async remove(name: string): Promise<void> {
    await Preferences.remove({ key: PREFIX + name });
  }

  async clear(): Promise<void> {
    const { keys } = await Preferences.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(PREFIX))
        .map((key) => Preferences.remove({ key }))
    );
  }
}
