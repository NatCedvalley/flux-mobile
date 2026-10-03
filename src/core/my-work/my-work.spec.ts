import {
  PROJECT_HUES,
  focusBuckets,
  isOverdue,
  projectHue,
  secondFact,
  statusTone,
} from './my-work';

const TODAY = '2026-10-01';

describe('focusBuckets', () => {
  it('splits by due date and drops undated and later tasks', () => {
    const tasks = [
      { id: 'a', dueDate: '2026-09-30' },
      { id: 'b', dueDate: '2026-10-01' },
      { id: 'c', dueDate: '2026-10-02' },
      { id: 'd', dueDate: '2026-10-08' },
      { id: 'e', dueDate: '2026-10-09' },
      { id: 'f' },
      { id: 'g', dueDate: '2026-01-01' },
    ];

    const ids = (list: { id: string }[]) => list.map((t) => t.id);
    const buckets = focusBuckets(tasks, TODAY);
    expect(ids(buckets.overdue)).toEqual(['a', 'g']);
    expect(ids(buckets.today)).toEqual(['b']);
    expect(ids(buckets.next7)).toEqual(['c', 'd']);
  });

  it('keeps the server order within a bucket', () => {
    const tasks = [
      { id: 'low', dueDate: '2026-10-03' },
      { id: 'high', dueDate: '2026-10-05' },
    ];
    expect(focusBuckets(tasks, TODAY).next7.map((t) => t.id)).toEqual([
      'low',
      'high',
    ]);
  });
});

describe('isOverdue', () => {
  it('is true only before today', () => {
    expect(isOverdue({ dueDate: '2026-09-30' }, TODAY)).toBe(true);
    expect(isOverdue({ dueDate: TODAY }, TODAY)).toBe(false);
    expect(isOverdue({}, TODAY)).toBe(false);
  });
});

describe('secondFact', () => {
  it('shows a critical or high priority over the due date', () => {
    expect(
      secondFact({ priority: 'CRITICAL', dueDate: '2026-09-01' }, TODAY)
    ).toEqual({ kind: 'priority', level: 'CRITICAL', label: 'Critical' });
    expect(secondFact({ priority: 'HIGH' }, TODAY)).toEqual({
      kind: 'priority',
      level: 'HIGH',
      label: 'High',
    });
  });

  it('otherwise shows the due date in words', () => {
    const due = (dueDate: string) =>
      secondFact({ priority: 'MEDIUM', dueDate }, TODAY);
    expect(due(TODAY)).toEqual({
      kind: 'due',
      label: 'Due today',
      overdue: false,
    });
    expect(due('2026-09-30')).toEqual({
      kind: 'due',
      label: 'Due yesterday',
      overdue: true,
    });
    expect(due('2026-09-17')).toEqual({
      kind: 'due',
      label: 'Due Thu 17 Sep',
      overdue: true,
    });
    expect(due('2026-10-08')).toEqual({
      kind: 'due',
      label: 'Thu 8 Oct',
      overdue: false,
    });
  });

  it('is null with no notable priority and no due date', () => {
    expect(secondFact({ priority: 'LOW' }, TODAY)).toBeNull();
    expect(secondFact({}, TODAY)).toBeNull();
  });
});

describe('statusTone', () => {
  it('follows the status category', () => {
    expect(statusTone('TODO')).toBe('todo');
    expect(statusTone('IN_PROGRESS')).toBe('progress');
    expect(statusTone('DONE')).toBe('done');
    expect(statusTone('PLANNING')).toBe('planning');
    expect(statusTone(undefined)).toBe('planning');
  });
});

describe('projectHue', () => {
  it('is stable for a project and one of the chip hues', () => {
    expect(projectHue('p1')).toBe(projectHue('p1'));
    expect(PROJECT_HUES).toContain(projectHue('p1'));
  });
});
