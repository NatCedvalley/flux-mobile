import type { Page } from '../api';
import { type PageFetcher, PagedList } from './paged-list';

type Row = { id: string };

/** Pages `count` rows with ids `prefix-0`… */
function fetcher(count: number, prefix = 'r') {
  const rows: Row[] = Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
  }));
  return vi.fn((page: number, size: number): Promise<Page<Row>> =>
    Promise.resolve({
      content: rows.slice(page * size, (page + 1) * size),
      totalElements: rows.length,
      last: (page + 1) * size >= rows.length,
    })
  );
}

const ids = (list: PagedList<Row>) => list.state.items.map((r) => r.id);

describe('PagedList', () => {
  it('loads the first page, then the next ones as asked', async () => {
    const fetch = fetcher(5);
    const list = new PagedList<Row>(2);

    await list.start(fetch);
    expect(ids(list)).toEqual(['r-0', 'r-1']);
    expect(list.state).toMatchObject({ total: 5, done: false });

    await list.loadMore();
    await list.loadMore();
    expect(ids(list)).toHaveLength(5);
    expect(list.state.done).toBe(true);
    expect(fetch.mock.calls).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);

    await list.loadMore();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('replaces the list on a new start, and notifies each time', async () => {
    const list = new PagedList<Row>(2);
    const listener = vi.fn();
    list.onChange(listener);

    await list.start(fetcher(3, 'a'));
    await list.start(fetcher(1, 'b'));

    expect(ids(list)).toEqual(['b-0']);
    expect(list.state.done).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('drops a first page that lands after a newer start', async () => {
    const list = new PagedList<Row>(2);
    let release: (page: Page<Row>) => void = () => undefined;
    const slow: PageFetcher<Row> = () =>
      new Promise((resolve) => (release = resolve));

    const first = list.start(slow);
    await list.start(fetcher(1, 'new'));
    release({ content: [{ id: 'old' }], totalElements: 1, last: true });
    await first;

    expect(ids(list)).toEqual(['new-0']);
  });

  it('shares one request between concurrent loadMore calls', async () => {
    const fetch = fetcher(5);
    const list = new PagedList<Row>(2);
    await list.start(fetch);

    await Promise.all([list.loadMore(), list.loadMore()]);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the list and retries the same page after a failure', async () => {
    const fetch = fetcher(5);
    const list = new PagedList<Row>(2);
    await list.start(fetch);
    fetch.mockRejectedValueOnce(new Error('offline'));

    await expect(list.loadMore()).rejects.toThrow('offline');
    expect(ids(list)).toHaveLength(2);

    await list.loadMore();
    expect(fetch).toHaveBeenLastCalledWith(1, 2);
    expect(ids(list)).toHaveLength(4);
  });
});
