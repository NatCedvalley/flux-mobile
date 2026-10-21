import { InjectionToken } from '@angular/core';
import { MemoryCacheStore, type CacheStore } from '@core/offline';

/**
 * Where `src/core/offline`'s `WriteQueue` keeps the changes made offline.
 * `main.ts` provides `PreferencesStore` on native builds; web (and tests)
 * keep them in memory.
 */
export const WRITE_QUEUE_STORE = new InjectionToken<CacheStore>(
  'WRITE_QUEUE_STORE',
  { providedIn: 'root', factory: () => new MemoryCacheStore() }
);
