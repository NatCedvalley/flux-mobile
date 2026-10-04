import type { FluxApi, ProjectTasksQuery, Task } from '../api';
import type { TaskGroup } from './groups';

/** Rows per request: 10 scrolls reach 500 rows. The server caps it at 100. */
export const PROJECT_PAGE_SIZE = 50;

/** flux-web's default order within a group, unless the base query sorts. */
export const DEFAULT_SORT = 'createdAt,desc';

/** A group with the rows loaded so far and its server-side total. */
export type LoadedGroup = {
  group: TaskGroup;
  tasks: Task[];
  total: number;
  complete: boolean;
};

export type PagerState = {
  /**
   * The groups to render, in order: every complete group, then the first
   * incomplete one. A later group never shows above an unfinished one.
   */
  groups: LoadedGroup[];
  /** Every group is fully loaded: nothing left to scroll for. */
  done: boolean;
};

type GroupProgress = LoadedGroup & { nextPage: number };

/**
 * Pages a project's task list group by group. The server can't sort tasks by
 * workflow status, so each group is its own filtered query (`status=…`):
 * `start` fetches the first page of every group at once, which also gives
 * each header its count and drops empty groups, and `loadMore` pages the
 * first group that isn't complete yet. A group's own filter wins over the
 * same key in the base query, so narrow the groups to the filter first
 * (`narrowGroups` in `@core/task-filters`).
 */
export class GroupedTaskPager {
  private projectId = '';
  private baseQuery: ProjectTasksQuery = {};
  private groups: GroupProgress[] = [];
  /** Bumped by `start`, so pages fetched for an older list are dropped. */
  private generation = 0;
  private loadingMore: Promise<void> | null = null;
  private listener: (state: PagerState) => void = () => undefined;

  constructor(
    private readonly api: FluxApi,
    private readonly pageSize = PROJECT_PAGE_SIZE
  ) {}

  get state(): PagerState {
    const firstIncomplete = this.groups.findIndex((g) => !g.complete);
    const visible =
      firstIncomplete < 0
        ? this.groups
        : this.groups.slice(0, firstIncomplete + 1);
    return {
      groups: visible.map(({ group, tasks, total, complete }) => ({
        group,
        tasks,
        total,
        complete,
      })),
      done: firstIncomplete < 0,
    };
  }

  /** Called with the new state after every page that lands. */
  onChange(listener: (state: PagerState) => void): void {
    this.listener = listener;
  }

  /**
   * Loads the first page of every group, replacing the current list only
   * once all of them land (so a refresh keeps the old rows meanwhile).
   * Rejects with the first failure.
   */
  async start(
    projectId: string,
    groups: readonly TaskGroup[],
    baseQuery: ProjectTasksQuery = {}
  ): Promise<void> {
    const generation = ++this.generation;
    this.loadingMore = null;
    const pages = await Promise.all(
      groups.map((group) =>
        this.api.listProjectTasks(projectId, {
          sort: DEFAULT_SORT,
          ...baseQuery,
          ...group.query,
          page: 0,
          size: this.pageSize,
        })
      )
    );
    if (generation !== this.generation) {
      return;
    }
    this.projectId = projectId;
    this.baseQuery = baseQuery;
    this.groups = groups
      .map((group, i) => {
        const tasks = pages[i].content ?? [];
        const total = pages[i].totalElements ?? tasks.length;
        return {
          group,
          tasks,
          total,
          complete: pages[i].last ?? tasks.length >= total,
          nextPage: 1,
        };
      })
      .filter((g) => g.total > 0);
    this.listener(this.state);
  }

  /**
   * Loads the next page of the first incomplete group. Concurrent calls share
   * one request. Rejects on failure, leaving the list as it was, so the next
   * call tries the same page again.
   */
  loadMore(): Promise<void> {
    this.loadingMore ??= this.fetchNext().finally(() => {
      this.loadingMore = null;
    });
    return this.loadingMore;
  }

  private async fetchNext(): Promise<void> {
    const target = this.groups.find((g) => !g.complete);
    if (!target) {
      return;
    }
    const generation = this.generation;
    const page = await this.api.listProjectTasks(this.projectId, {
      sort: DEFAULT_SORT,
      ...this.baseQuery,
      ...target.group.query,
      page: target.nextPage,
      size: this.pageSize,
    });
    if (generation !== this.generation) {
      return;
    }
    const content = page.content ?? [];
    // Skip any row a newer task pushed onto this page from the last one.
    const seen = new Set(target.tasks.map((t) => t.id));
    target.tasks = [...target.tasks, ...content.filter((t) => !seen.has(t.id))];
    target.total = page.totalElements ?? target.total;
    target.nextPage++;
    target.complete =
      content.length === 0 ||
      (page.last ?? target.tasks.length >= target.total);
    this.listener(this.state);
  }
}
