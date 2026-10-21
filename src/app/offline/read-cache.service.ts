import { Injectable, Injector, effect, inject } from '@angular/core';
import { ResponseCache } from '@core/offline';
import { AuthService } from '../auth/auth.service';
import { CACHE_STORE } from '../providers/cache-store.token';

/**
 * The read cache behind `FLUX_API` (see `CachingFluxApi`): what My Work,
 * the Projects list, task detail and the Inbox last loaded, kept for the
 * signed-in account and wiped whenever no one is signed in.
 */
@Injectable({ providedIn: 'root' })
export class ReadCacheService {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  readonly cache = new ResponseCache(inject(CACHE_STORE));

  /** Runs once at startup. */
  init(): void {
    // Watched only after the cold-start restore. Signed-in state, not the
    // account: a cold start offline may be signed in with no account yet.
    void this.auth.restore().then(() =>
      effect(
        () => {
          if (!this.auth.isSignedIn()) {
            void this.cache.clear();
          }
        },
        { injector: this.injector }
      )
    );
  }
}
