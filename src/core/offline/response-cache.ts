import type { CacheStore } from './cache-store';

/** Past this many characters of saved JSON, the oldest entries go first. */
export const MAX_CACHE_SIZE = 10 * 1024 * 1024;

/** An entry older than this is never served. */
export const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60_000;

const INDEX = 'index.json';

type IndexEntry = {
  file: string;
  /** Characters of JSON, close enough to bytes for the cap. */
  size: number;
  /** Epoch milliseconds of the fetch that saved it. */
  savedAt: number;
};

type CacheIndex = {
  accountId: string;
  entries: Record<string, IndexEntry>;
};

export type ResponseCacheOptions = {
  maxSize?: number;
  maxAgeMs?: number;
  now?: () => number;
};

/**
 * The responses last fetched for one account, kept in a `CacheStore` (one
 * blob per response plus an index) so they survive the app being killed.
 *
 * Best-effort: a store failure is logged and reads as a miss, and never
 * fails the request that wanted the cache. Using it for another account
 * wipes the previous account's entries first. Every operation runs one at a
 * time, so the index and the blobs stay in step.
 */
export class ResponseCache {
  /** Undefined until loaded from the store; null when there is none. */
  private index: CacheIndex | null | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly maxSize: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;

  constructor(
    private readonly store: CacheStore,
    options: ResponseCacheOptions = {}
  ) {
    this.maxSize = options.maxSize ?? MAX_CACHE_SIZE;
    this.maxAgeMs = options.maxAgeMs ?? MAX_CACHE_AGE_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /** The value saved under `key` for `accountId`, if any and not too old. */
  get<T>(accountId: string, key: string): Promise<T | undefined> {
    return this.run(async () => {
      const index = await this.indexFor(accountId);
      const entry = index.entries[key];
      if (!entry) {
        return undefined;
      }
      const data =
        this.now() - entry.savedAt > this.maxAgeMs
          ? undefined
          : await this.store.read(entry.file);
      const saved = data === undefined ? undefined : parseBlob(data);
      if (saved?.key !== key) {
        // Too old, purged by the OS, unreadable, or another key's blob.
        await this.drop(index, key);
        await this.saveIndex(index);
        return undefined;
      }
      return saved.value as T;
    });
  }

  /** Saves `value` under `key` for `accountId`, replacing any older copy. */
  put(accountId: string, key: string, value: unknown): Promise<void> {
    return this.run(async () => {
      const index = await this.indexFor(accountId);
      const file = fileName(key);
      const data = JSON.stringify({ key, value });
      // A different key with the same file name loses its entry.
      for (const [other, entry] of Object.entries(index.entries)) {
        if (entry.file === file && other !== key) {
          delete index.entries[other];
        }
      }
      await this.store.write(file, data);
      index.entries[key] = { file, size: data.length, savedAt: this.now() };
      await this.evict(index);
      await this.saveIndex(index);
    });
  }

  /** Forgets every entry, of every account. */
  clear(): Promise<void> {
    return this.run(async () => {
      this.index = null;
      await this.store.clear();
    });
  }

  private async indexFor(accountId: string): Promise<CacheIndex> {
    if (this.index === undefined) {
      this.index = parseIndex(await this.store.read(INDEX));
    }
    if (this.index?.accountId !== accountId) {
      // Another account's entries (or blobs no index knows about).
      await this.store.clear();
      this.index = { accountId, entries: {} };
    }
    return this.index;
  }

  /** Drops expired entries, then the oldest until the rest fit the cap. */
  private async evict(index: CacheIndex): Promise<void> {
    const oldestFirst = Object.entries(index.entries).sort(
      ([, a], [, b]) => a.savedAt - b.savedAt
    );
    let size = oldestFirst.reduce((sum, [, entry]) => sum + entry.size, 0);
    for (const [key, entry] of oldestFirst) {
      if (size <= this.maxSize && this.now() - entry.savedAt <= this.maxAgeMs) {
        continue;
      }
      size -= entry.size;
      await this.drop(index, key);
    }
  }

  private async drop(index: CacheIndex, key: string): Promise<void> {
    const entry = index.entries[key];
    if (entry) {
      delete index.entries[key];
      await this.store.remove(entry.file);
    }
  }

  private saveIndex(index: CacheIndex): Promise<void> {
    return this.store.write(INDEX, JSON.stringify(index));
  }

  /**
   * Runs `task` after every earlier one. A failure is logged, resolves to
   * undefined, and makes the next task reload the index from the store.
   */
  private run<T>(task: () => Promise<T>): Promise<T | undefined> {
    const result = this.queue.then(task).catch((error: unknown) => {
      console.warn('Read cache failed', error);
      this.index = undefined;
      return undefined;
    });
    this.queue = result;
    return result;
  }
}

/** FNV-1a: a short, stable file name for a key of any length. */
function fileName(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}.json`;
}

function parseBlob(
  data: string
): { key?: unknown; value?: unknown } | undefined {
  try {
    const blob: unknown = JSON.parse(data);
    return typeof blob === 'object' && blob !== null ? blob : undefined;
  } catch {
    return undefined;
  }
}

/** Null for a missing index, or one an older app version wrote. */
function parseIndex(data: string | undefined): CacheIndex | null {
  const index = data === undefined ? undefined : parseBlob(data);
  const { accountId, entries } = (index ?? {}) as Partial<CacheIndex>;
  return typeof accountId === 'string' &&
    typeof entries === 'object' &&
    entries !== null
    ? { accountId, entries }
    : null;
}
