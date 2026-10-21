/**
 * Named text blobs the read cache keeps between launches. Native builds get
 * an app-private file implementation from src/app (the `CACHE_STORE`
 * injection token); web and tests use `MemoryCacheStore`.
 */
export type CacheStore = {
  /** Undefined when there is no such blob (or it can't be read). */
  read(name: string): Promise<string | undefined>;
  write(name: string, data: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** Removes every blob. */
  clear(): Promise<void>;
};

/** Keeps the blobs in memory only, so they are gone on reload. */
export class MemoryCacheStore implements CacheStore {
  private readonly blobs = new Map<string, string>();

  async read(name: string): Promise<string | undefined> {
    return this.blobs.get(name);
  }

  async write(name: string, data: string): Promise<void> {
    this.blobs.set(name, data);
  }

  async remove(name: string): Promise<void> {
    this.blobs.delete(name);
  }

  async clear(): Promise<void> {
    this.blobs.clear();
  }
}
