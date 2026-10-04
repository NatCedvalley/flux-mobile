import type { Page } from '../api';

/** Fetches one zero-based page of `size` rows. */
export type PageFetcher<T> = (page: number, size: number) => Promise<Page<T>>;

export type PagedListState<T> = {
  items: T[];
  /** The server's total, for every page. */
  total: number;
  /** Every page is loaded: nothing left to scroll for. */
  done: boolean;
};

/**
 * One flat list paged as you scroll, as the search pages show their
 * results. `start` replaces the list once its first page lands (so a new
 * search keeps the old rows meanwhile), and a page fetched for an older
 * list is dropped.
 */
export class PagedList<T extends { id?: string }> {
  private fetchPage: PageFetcher<T> | null = null;
  private items: T[] = [];
  private total = 0;
  private nextPage = 0;
  private complete = true;
  /** Bumped by `start`, so pages fetched for an older list are dropped. */
  private generation = 0;
  private loadingMore: Promise<void> | null = null;
  private listener: (state: PagedListState<T>) => void = () => undefined;

  constructor(private readonly pageSize: number) {}

  get state(): PagedListState<T> {
    return { items: this.items, total: this.total, done: this.complete };
  }

  /** Called with the new state after every page that lands. */
  onChange(listener: (state: PagedListState<T>) => void): void {
    this.listener = listener;
  }

  /** Loads the first page through `fetchPage`. Rejects on failure. */
  async start(fetchPage: PageFetcher<T>): Promise<void> {
    const generation = ++this.generation;
    this.loadingMore = null;
    const page = await fetchPage(0, this.pageSize);
    if (generation !== this.generation) {
      return;
    }
    this.fetchPage = fetchPage;
    this.items = [];
    this.nextPage = 0;
    this.apply(page);
  }

  /**
   * Loads the next page. Concurrent calls share one request. Rejects on
   * failure, leaving the list as it was, so the next call tries again.
   */
  loadMore(): Promise<void> {
    this.loadingMore ??= this.fetchNext().finally(() => {
      this.loadingMore = null;
    });
    return this.loadingMore;
  }

  private async fetchNext(): Promise<void> {
    if (this.complete || !this.fetchPage) {
      return;
    }
    const generation = this.generation;
    const page = await this.fetchPage(this.nextPage, this.pageSize);
    if (generation === this.generation) {
      this.apply(page);
    }
  }

  private apply(page: Page<T>): void {
    const content = page.content ?? [];
    // Skip any row a newer task pushed onto this page from the last one.
    const seen = new Set(this.items.map((t) => t.id));
    this.items = [...this.items, ...content.filter((t) => !seen.has(t.id))];
    this.total = page.totalElements ?? this.items.length;
    this.nextPage++;
    this.complete =
      content.length === 0 || (page.last ?? this.items.length >= this.total);
    this.listener(this.state);
  }
}
