import type { TaskGroup } from '../project-list';
import {
  EMPTY_FILTERS,
  EMPTY_MY_TASK_FILTERS,
  activeFilterCount,
  assigneeOptions,
  filterQuery,
  filteredGroups,
  myTaskFilterQuery,
  type TaskFilters,
} from './task-filters';

const STATUS_GROUPS: TaskGroup[] = ['todo', 'doing', 'done'].map((slug) => ({
  key: slug,
  label: slug,
  hue: 'gray',
  query: { status: slug },
}));

const PRIORITY_GROUPS: TaskGroup[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(
  (priority) => ({
    key: priority,
    label: priority,
    hue: 'gray',
    query: { priority },
  })
);

const FILTERS: TaskFilters = {
  statuses: ['todo', 'done'],
  priorities: ['HIGH'],
  assigneeIds: ['a1', 'a2'],
};

describe('task filters', () => {
  it('counts the filters in use, not their values', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount(FILTERS)).toBe(3);
    expect(activeFilterCount({ ...EMPTY_FILTERS, assigneeIds: ['a1'] })).toBe(
      1
    );
    expect(activeFilterCount(EMPTY_MY_TASK_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        projectId: 'p1',
        statuses: ['todo'],
        priorities: [],
      })
    ).toBe(2);
  });

  it('joins each filter into a comma list and leaves out empty ones', () => {
    expect(filterQuery(FILTERS)).toEqual({
      status: 'todo,done',
      priority: 'HIGH',
      assigneeId: 'a1,a2',
    });
    expect(filterQuery(EMPTY_FILTERS)).toEqual({
      status: undefined,
      priority: undefined,
      assigneeId: undefined,
    });
    expect(
      myTaskFilterQuery({
        projectId: 'p1',
        statuses: ['todo'],
        priorities: ['LOW', 'HIGH'],
      })
    ).toEqual({ projectId: 'p1', status: 'todo', priority: 'LOW,HIGH' });
  });

  it('keeps only the selected status groups when grouped by status', () => {
    const { groups, query } = filteredGroups('status', STATUS_GROUPS, FILTERS);
    expect(groups.map((g) => g.key)).toEqual(['todo', 'done']);
    expect(query).toEqual({
      status: undefined,
      priority: 'HIGH',
      assigneeId: 'a1,a2',
    });
  });

  it('keeps only the selected priority groups when grouped by priority', () => {
    const { groups, query } = filteredGroups(
      'priority',
      PRIORITY_GROUPS,
      FILTERS
    );
    expect(groups.map((g) => g.key)).toEqual(['HIGH']);
    expect(query.priority).toBeUndefined();
    expect(query.status).toBe('todo,done');
  });

  it('keeps every group when the grouped field is not filtered', () => {
    expect(
      filteredGroups('status', STATUS_GROUPS, EMPTY_FILTERS).groups
    ).toHaveLength(3);
    const { groups, query } = filteredGroups(
      'type',
      [{ key: 'BUG', label: 'Bug', hue: 'gray', query: { type: 'BUG' } }],
      FILTERS
    );
    expect(groups).toHaveLength(1);
    expect(query).toEqual(filterQuery(FILTERS));
  });

  it('lists the caller first as Me, then members by name', () => {
    const options = assigneeOptions(
      [
        { accountId: 'a3', firstName: 'Chen', lastName: 'Wei' },
        { accountId: 'a1', firstName: 'Ada', lastName: 'Rahman' },
        { email: 'no-account@flux.test' },
        { accountId: 'a2', firstName: 'Ben', lastName: 'Tan' },
        { accountId: 'a4', email: 'zed@flux.test' },
      ],
      'a3'
    );
    expect(options.map((o) => [o.accountId, o.label])).toEqual([
      ['a3', 'Me'],
      ['a1', 'Ada Rahman'],
      ['a2', 'Ben Tan'],
      ['a4', 'zed@flux.test'],
    ]);
  });
});
