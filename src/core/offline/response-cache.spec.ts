import { MemoryCacheStore } from './cache-store';
import { MAX_CACHE_AGE_MS, ResponseCache } from './response-cache';

describe('ResponseCache', () => {
  let store: MemoryCacheStore;
  let clock: number;
  let cache: ResponseCache;

  function newCache(maxSize?: number): ResponseCache {
    return new ResponseCache(store, { maxSize, now: () => clock });
  }

  beforeEach(() => {
    store = new MemoryCacheStore();
    clock = 1_000;
    cache = newCache();
  });

  it('returns what was put', async () => {
    await cache.put('a1', 'getTask:["p1","t1"]', { id: 't1' });

    expect(await cache.get('a1', 'getTask:["p1","t1"]')).toEqual({ id: 't1' });
    expect(await cache.get('a1', 'getTask:["p1","t2"]')).toBeUndefined();
  });

  it('replaces an older copy', async () => {
    await cache.put('a1', 'k', 1);
    await cache.put('a1', 'k', 2);

    expect(await cache.get('a1', 'k')).toBe(2);
  });

  it('survives a new instance over the same store', async () => {
    await cache.put('a1', 'k', { title: 'Saved' });

    expect(await newCache().get('a1', 'k')).toEqual({ title: 'Saved' });
  });

  it('wipes another account’s entries', async () => {
    await cache.put('a1', 'k', 'mine');

    expect(await cache.get('a2', 'k')).toBeUndefined();
    expect(await cache.get('a1', 'k')).toBeUndefined();
  });

  it('wipes another account’s entries left by an earlier launch', async () => {
    await cache.put('a1', 'k', 'theirs');
    const next = newCache();
    await next.put('a2', 'other', 'mine');

    expect(await store.read('index.json')).not.toContain('"k"');
    expect(await next.get('a1', 'k')).toBeUndefined();
  });

  it('never serves an entry past its age', async () => {
    await cache.put('a1', 'k', 'old');

    clock += MAX_CACHE_AGE_MS;
    expect(await cache.get('a1', 'k')).toBe('old');

    clock += 1;
    expect(await cache.get('a1', 'k')).toBeUndefined();
  });

  it('evicts the oldest entries past the size cap', async () => {
    cache = newCache(130);
    await cache.put('a1', 'first', 'x'.repeat(30));
    clock++;
    await cache.put('a1', 'second', 'y'.repeat(30));
    clock++;
    await cache.put('a1', 'third', 'z'.repeat(30));

    expect(await cache.get('a1', 'first')).toBeUndefined();
    expect(await cache.get('a1', 'second')).toBeDefined();
    expect(await cache.get('a1', 'third')).toBeDefined();
  });

  it('counts a refetch as new', async () => {
    cache = newCache(130);
    await cache.put('a1', 'first', 'x'.repeat(30));
    clock++;
    await cache.put('a1', 'second', 'y'.repeat(30));
    clock++;
    await cache.put('a1', 'first', 'x'.repeat(30));
    clock++;
    await cache.put('a1', 'third', 'z'.repeat(30));

    expect(await cache.get('a1', 'first')).toBeDefined();
    expect(await cache.get('a1', 'second')).toBeUndefined();
  });

  it('treats a blob the OS purged as a miss', async () => {
    await cache.put('a1', 'k', 'saved');
    const index = JSON.parse((await store.read('index.json')) ?? '{}');
    await store.remove(index.entries.k.file);

    expect(await cache.get('a1', 'k')).toBeUndefined();
  });

  it('forgets everything on clear', async () => {
    await cache.put('a1', 'k', 'saved');

    await cache.clear();

    expect(await cache.get('a1', 'k')).toBeUndefined();
    expect(await store.read('index.json')).toBeUndefined();
  });

  it('reads as a miss when the store fails, and recovers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await cache.put('a1', 'k', 'saved');
    vi.spyOn(store, 'read').mockRejectedValueOnce(new Error('io'));

    expect(await newCache().get('a1', 'k')).toBeUndefined();
    expect(await cache.get('a1', 'k')).toBe('saved');
  });

  it('swallows a failed write', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(store, 'write').mockRejectedValue(new Error('disk full'));

    await expect(cache.put('a1', 'k', 'saved')).resolves.toBeUndefined();
  });

  it('ignores an index it can’t parse', async () => {
    await store.write('index.json', 'not json');
    await store.write('stray.json', 'left over');

    expect(await cache.get('a1', 'k')).toBeUndefined();
    expect(await store.read('stray.json')).toBeUndefined();
  });
});
