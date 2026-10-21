import { InjectionToken } from '@angular/core';
import type { CacheStore } from '@core/offline';

/**
 * Where `src/core/offline` keeps the read cache. `main.ts` provides the
 * app-private `FileCacheStore` on native builds and an in-memory store on
 * web.
 */
export const CACHE_STORE = new InjectionToken<CacheStore>('CACHE_STORE');
