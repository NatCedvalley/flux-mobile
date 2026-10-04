import type { FluxApi, Page, ProjectTasksQuery, Task } from '../api';
import type { TaskGroup } from './groups';
import { GroupedTaskPager, type PagerState } from './grouped-task-pager';

const GROUPS: TaskGroup[] = ['todo', 'doing', 'review', 'done'].map((slug) => ({
  key: slug,
  label: slug,
  hue: 'gray',
  query: { status: slug },
}));

/** `count` tasks in status `slug`, ids `slug-0`… */
function tasksIn(slug: string, count: number): Task[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${slug}-${i}`,
    status: slug,
  }));
}

/** Pages `rows` by status, like the server with a `status` filter. */
function fakeApi(rows: Task[]) {
  const listProjectTasks = vi.fn(
    (
      _projectId: string,
      query: ProjectTasksQuery = {}
    ): Promise<Page<Task>> => {
      const matches = rows.filter((t) => t.status === query.status);
      const page = query.page ?? 0;
      const size = query.size ?? 20;
      const content = matches.slice(page * size, (page + 1) * size);
      return Promise.resolve({
        content,
        page,
        totalElements: matches.length,
        last: (page + 1) * size >= matches.length,
      });
    }
  );
  return { api: { listProjectTasks } as unknown as FluxApi, listProjectTasks };
}

function summary(state: PagerState): [string, number, number][] {
  return state.groups.map((g) => [g.group.key, g.tasks.length, g.total]);
}

describe('GroupedTaskPager', () => {
  const rows = [
    ...tasksIn('todo', 3),
    ...tasksIn('doing', 5),
    ...tasksIn('done', 2),
  ];

  it('loads the first page of every group at once, with the base query', async () => {
    const { api, listProjectTasks } = fakeApi(rows);
    const pager = new GroupedTaskPager(api, 2);

    await pager.start('p1', GROUPS, { excludeLabel: 'ai:candidate' });

    expect(listProjectTasks).toHaveBeenCalledTimes(4);
    expect(listProjectTasks).toHaveBeenCalledWith('p1', {
      excludeLabel: 'ai:candidate',
      status: 'doing',
      sort: 'createdAt,desc',
      page: 0,
      size: 2,
    });
  });

  it('sorts by the base query’s sort, on every page', async () => {
    const { api, listProjectTasks } = fakeApi(rows);
    const pager = new GroupedTaskPager(api, 2);

    await pager.start('p1', GROUPS, { sort: 'dueDate,asc' });
    await pager.loadMore();

    expect(
      listProjectTasks.mock.calls.every(
        ([, query]) => query?.sort === 'dueDate,asc'
      )
    ).toBe(true);
    expect(listProjectTasks).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ status: 'todo', page: 1 })
    );
  });

  it('drops empty groups and shows groups only up to the first incomplete one', async () => {
    const { api } = fakeApi(rows);
    const pager = new GroupedTaskPager(api, 2);

    await pager.start('p1', GROUPS);

    // todo has 3 rows: page 0 holds 2, so it is the last group shown.
    expect(summary(pager.state)).toEqual([['todo', 2, 3]]);
    expect(pager.state.done).toBe(false);
  });

  it('pages through each group in order until all are loaded', async () => {
    const { api } = fakeApi(rows);
    const pager = new GroupedTaskPager(api, 2);
    await pager.start('p1', GROUPS);

    await pager.loadMore();
    // todo is complete; doing already had its first page from start.
    expect(summary(pager.state)).toEqual([
      ['todo', 3, 3],
      ['doing', 2, 5],
    ]);

    await pager.loadMore();
    await pager.loadMore();
    expect(summary(pager.state)).toEqual([
      ['todo', 3, 3],
      ['doing', 5, 5],
      ['done', 2, 2],
    ]);
    expect(pager.state.done).toBe(true);
    expect(pager.state.groups[1].tasks.map((t) => t.id)).toEqual([
      'doing-0',
      'doing-1',
      'doing-2',
      'doing-3',
      'doing-4',
    ]);
  });

  it('does nothing more once every group is loaded', async () => {
    const { api, listProjectTasks } = fakeApi(tasksIn('todo', 1));
    const pager = new GroupedTaskPager(api, 2);
    await pager.start('p1', GROUPS);
    listProjectTasks.mockClear();

    await pager.loadMore();

    expect(listProjectTasks).not.toHaveBeenCalled();
    expect(pager.state.done).toBe(true);
  });

  it('shares one request between concurrent loadMore calls', async () => {
    const { api, listProjectTasks } = fakeApi(rows);
    const pager = new GroupedTaskPager(api, 2);
    await pager.start('p1', GROUPS);
    listProjectTasks.mockClear();

    await Promise.all([pager.loadMore(), pager.loadMore()]);

    expect(listProjectTasks).toHaveBeenCalledTimes(1);
  });

  it('notifies after every page', async () => {
    const { api } = fakeApi(rows);
    const pager = new GroupedTaskPager(api, 2);
    const listener = vi.fn();
    pager.onChange(listener);

    await pager.start('p1', GROUPS);
    await pager.loadMore();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('ignores a page that lands after a newer start', async () => {
    const { api, listProjectTasks } = fakeApi(rows);
    const pager = new GroupedTaskPager(api, 2);
    await pager.start('p1', GROUPS);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    listProjectTasks.mockImplementationOnce(async () => {
      await gate;
      return { content: tasksIn('stale', 2), totalElements: 9, last: false };
    });
    const stale = pager.loadMore();
    await pager.start('p2', GROUPS.slice(2));
    release();
    await stale;

    expect(summary(pager.state)).toEqual([['done', 2, 2]]);
  });

  it('keeps the list and retries the same page after a failure', async () => {
    const { api, listProjectTasks } = fakeApi(rows);
    const pager = new GroupedTaskPager(api, 2);
    await pager.start('p1', GROUPS);
    listProjectTasks.mockRejectedValueOnce(new Error('offline'));

    await expect(pager.loadMore()).rejects.toThrow('offline');
    expect(summary(pager.state)).toEqual([['todo', 2, 3]]);

    await pager.loadMore();
    expect(listProjectTasks).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ status: 'todo', page: 1 })
    );
    expect(summary(pager.state)[0]).toEqual(['todo', 3, 3]);
  });
});
