import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { CacheStore } from '@core/offline';

const FOLDER = 'flux-cache';

/**
 * Keeps the read cache as files in the app's Cache directory: private to
 * the app, never backed up (unlike Documents, which iCloud backs up), and
 * the OS may purge it under storage pressure, which reads as a miss.
 * Native only.
 */
export class FileCacheStore implements CacheStore {
  async read(name: string): Promise<string | undefined> {
    try {
      const { data } = await Filesystem.readFile({
        path: `${FOLDER}/${name}`,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      return typeof data === 'string' ? data : undefined;
    } catch {
      return undefined; // Not there (yet, or any more).
    }
  }

  async write(name: string, data: string): Promise<void> {
    await Filesystem.writeFile({
      path: `${FOLDER}/${name}`,
      data,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  }

  async remove(name: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: `${FOLDER}/${name}`,
        directory: Directory.Cache,
      });
    } catch {
      // Already gone.
    }
  }

  async clear(): Promise<void> {
    try {
      await Filesystem.rmdir({
        path: FOLDER,
        directory: Directory.Cache,
        recursive: true,
      });
    } catch {
      // Nothing saved yet.
    }
  }
}
