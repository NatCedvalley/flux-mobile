import type { Page, Task } from '../api';
import {
  allPages,
  dayLines,
  isOverdueSpan,
  monthGrid,
  monthOf,
  monthTitle,
  monthWindow,
  rescheduleChange,
  scheduleOf,
  shiftMonth,
  taskSpan,
  tasksByDay,
} from './calendar';

const task = (id: string, fields: Partial<Task> = {}): Task => ({
  id,
  taskKey: `CHK-${id}`,
  ...fields,
});

describe('months', () => {
  it('takes the month of a day, and moves across year ends', () => {
    expect(monthOf('2026-10-13')).toBe('2026-10');
    expect(shiftMonth('2026-10', 1)).toBe('2026-11');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', -14)).toBe('2025-08');
  });

  it('names the month in full', () => {
    expect(monthTitle('2026-09')).toBe('September 2026');
  });
});

describe('monthWindow', () => {
  it('runs from the Monday on or before the 1st to the Sunday after the end', () => {
    // 1 Oct 2026 is a Thursday, 31 Oct a Saturday.
    expect(monthWindow('2026-10')).toEqual({
      from: '2026-09-28',
      to: '2026-11-01',
    });
  });

  it('starts on the 1st when it is a Monday', () => {
    expect(monthWindow('2027-02')).toEqual({
      from: '2027-02-01',
      to: '2027-02-28',
    });
  });
});

describe('monthGrid', () => {
  const rows = (month: string) => monthGrid(month, '2026-10-13').length;

  it('has as many weeks as the month needs', () => {
    expect(rows('2027-02')).toBe(4);
    expect(rows('2026-10')).toBe(5);
    expect(rows('2026-08')).toBe(6);
  });

  it('starts every week on Monday and marks weekends, today and other months', () => {
    const weeks = monthGrid('2026-10', '2026-10-13');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({
      iso: '2026-09-28',
      day: 28,
      inMonth: false,
      weekend: false,
      today: false,
    });
    expect(weeks[0].map((d) => d.weekend)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(weeks[2][1]).toMatchObject({ iso: '2026-10-13', today: true });
    expect(weeks[4][6]).toMatchObject({ iso: '2026-11-01', inMonth: false });
  });
});

describe('taskSpan', () => {
  it('uses the planned range, else the due date', () => {
    expect(
      taskSpan({
        dueDate: '2026-10-20',
        plannedStartDate: '2026-10-05',
        plannedEndDate: '2026-10-07',
      })
    ).toEqual({ start: '2026-10-05', end: '2026-10-07' });
    expect(taskSpan({ dueDate: '2026-10-20' })).toEqual({
      start: '2026-10-20',
      end: '2026-10-20',
    });
  });

  it('is undefined for an unscheduled task', () => {
    expect(taskSpan({})).toBeUndefined();
  });

  it('never ends before it starts', () => {
    expect(
      taskSpan({ plannedStartDate: '2026-10-05', dueDate: '2026-10-01' })
    ).toEqual({ start: '2026-10-05', end: '2026-10-05' });
  });
});

describe('tasksByDay', () => {
  it('puts a ranged task on every day it covers inside the window', () => {
    const ranged = task('1', {
      plannedStartDate: '2026-09-26',
      plannedEndDate: '2026-09-29',
    });
    const due = task('2', { dueDate: '2026-09-29' });
    const days = tasksByDay(
      [ranged, due, task('3')],
      '2026-09-28',
      '2026-11-01'
    );
    expect([...days.keys()]).toEqual(['2026-09-28', '2026-09-29']);
    expect(days.get('2026-09-29')?.map((t) => t.id)).toEqual(['1', '2']);
  });
});

describe('dayLines', () => {
  const tasks = ['1', '2', '3', '4'].map((id) => task(id));

  it('shows every task that fits', () => {
    expect(dayLines(tasks.slice(0, 2))).toEqual({
      pills: tasks.slice(0, 2),
      more: 0,
    });
  });

  it('gives the last line to +n more when they do not fit', () => {
    expect(dayLines(tasks.slice(0, 3))).toEqual({
      pills: tasks.slice(0, 1),
      more: 2,
    });
    expect(dayLines(tasks, 3)).toEqual({ pills: tasks.slice(0, 2), more: 2 });
  });
});

describe('isOverdueSpan', () => {
  it('is overdue once the span has ended and the task is still open', () => {
    const today = '2026-10-13';
    expect(isOverdueSpan(task('1', { dueDate: '2026-10-12' }), today)).toBe(
      true
    );
    expect(isOverdueSpan(task('1', { dueDate: '2026-10-13' }), today)).toBe(
      false
    );
    expect(
      isOverdueSpan(
        task('1', { dueDate: '2026-10-12', statusCategory: 'DONE' }),
        today
      )
    ).toBe(false);
    expect(
      isOverdueSpan(
        task('1', {
          plannedStartDate: '2026-10-10',
          plannedEndDate: '2026-10-14',
          dueDate: '2026-10-01',
        }),
        today
      )
    ).toBe(false);
  });
});

describe('rescheduleChange', () => {
  it('sets the due date of a task dropped from the drawer', () => {
    expect(rescheduleChange(task('1'), undefined, '2026-10-20')).toEqual({
      dueDate: '2026-10-20',
    });
  });

  it('moves the due date of a task without a planned range', () => {
    expect(
      rescheduleChange(
        task('1', { dueDate: '2026-10-13' }),
        '2026-10-13',
        '2026-10-16'
      )
    ).toEqual({ dueDate: '2026-10-16' });
  });

  it('moves a planned range by the days dragged, keeping its length', () => {
    const ranged = task('1', {
      dueDate: '2026-10-30',
      plannedStartDate: '2026-10-12',
      plannedEndDate: '2026-10-14',
    });
    // Picked up by its middle day and dropped across the month end.
    expect(rescheduleChange(ranged, '2026-10-13', '2026-11-02')).toEqual({
      plannedStartDate: '2026-11-01',
      plannedEndDate: '2026-11-03',
    });
    expect(rescheduleChange(ranged, '2026-10-13', '2026-10-10')).toEqual({
      plannedStartDate: '2026-10-09',
      plannedEndDate: '2026-10-11',
    });
  });

  it('changes nothing when dropped on the same day', () => {
    const due = task('1', { dueDate: '2026-10-13' });
    expect(rescheduleChange(due, '2026-10-13', '2026-10-13')).toBeUndefined();
    expect(rescheduleChange(due, undefined, '2026-10-13')).toBeUndefined();
  });
});

describe('scheduleOf', () => {
  it('takes the three dates a reschedule can change', () => {
    expect(
      scheduleOf(
        task('1', {
          dueDate: '2026-10-13',
          plannedStartDate: '2026-10-10',
          plannedEndDate: '2026-10-12',
          title: 'x',
        })
      )
    ).toEqual({
      dueDate: '2026-10-13',
      plannedStartDate: '2026-10-10',
      plannedEndDate: '2026-10-12',
    });
  });
});

describe('allPages', () => {
  const pages = (sizes: number[]) => {
    const fetch = vi.fn((page: number, size: number): Promise<Page<number>> =>
      Promise.resolve({
        content: Array.from({ length: sizes[page] }, (_, i) => page * 10 + i),
        page,
        size,
        totalElements: sizes.reduce((a, b) => a + b, 0),
        last: page === sizes.length - 1,
      })
    );
    return fetch;
  };

  it('fetches until the last page', async () => {
    const fetch = pages([2, 2, 1]);
    expect(await allPages(fetch, 2)).toEqual([0, 1, 10, 11, 20]);
    expect(fetch.mock.calls).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });

  it('stops at an empty page', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve({ content: [], totalElements: 5 } as Page<number>)
    );
    expect(await allPages(fetch)).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
