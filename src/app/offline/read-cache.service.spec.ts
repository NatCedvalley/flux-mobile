import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MemoryCacheStore } from '@core/offline';
import { AuthService } from '../auth/auth.service';
import { CACHE_STORE } from '../providers/cache-store.token';
import { ReadCacheService } from './read-cache.service';

describe('ReadCacheService', () => {
  let isSignedIn: ReturnType<typeof signal<boolean>>;
  let service: ReadCacheService;

  beforeEach(() => {
    isSignedIn = signal(true);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isSignedIn,
            restore: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: CACHE_STORE, useValue: new MemoryCacheStore() },
      ],
    });
    service = TestBed.inject(ReadCacheService);
  });

  /** Lets `init`'s restore-then-watch chain and its effect run. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }

  it('keeps the cache while signed in, with or without an account', async () => {
    await service.cache.put('a1', 'k', 'saved');

    service.init();
    await settle();

    expect(await service.cache.get('a1', 'k')).toBe('saved');
  });

  it('wipes the cache on sign-out', async () => {
    service.init();
    await settle();
    await service.cache.put('a1', 'k', 'saved');

    isSignedIn.set(false);
    await settle();

    expect(await service.cache.get('a1', 'k')).toBeUndefined();
  });

  it('wipes the cache when a cold start finds no session', async () => {
    isSignedIn.set(false);
    await service.cache.put('a1', 'k', 'saved');

    service.init();
    await settle();

    expect(await service.cache.get('a1', 'k')).toBeUndefined();
  });
});
