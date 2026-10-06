import {
  assigneeSummary,
  commentCount,
  detailDue,
  relativeTime,
  timeOfDay,
} from './details';

const TODAY = '2026-10-01';

describe('detailDue', () => {
  it('says when there is no due date', () => {
    expect(detailDue({}, TODAY)).toEqual({
      label: 'No due date',
      overdue: false,
    });
  });

  it('shows today and future dates plainly', () => {
    expect(detailDue({ dueDate: TODAY }, TODAY).label).toBe('Today');
    expect(detailDue({ dueDate: '2026-10-12' }, TODAY)).toEqual({
      label: '12 Oct',
      overdue: false,
    });
  });

  it('marks a past date overdue, unless the task is closed', () => {
    expect(detailDue({ dueDate: '2026-09-12' }, TODAY)).toEqual({
      label: '12 Sep · overdue',
      overdue: true,
    });
    expect(
      detailDue({ dueDate: '2026-09-12', statusCategory: 'DONE' }, TODAY)
    ).toEqual({ label: '12 Sep', overdue: false });
  });
});

describe('assigneeSummary', () => {
  it('gives the first assignee and how many more', () => {
    const ada = { accountId: 'a1', firstName: 'Ada' };
    const ben = { accountId: 'a2', firstName: 'Ben' };
    expect(assigneeSummary([ada, ben])).toEqual({ first: ada, more: 1 });
    expect(assigneeSummary([ada])).toEqual({ first: ada, more: 0 });
    expect(assigneeSummary(undefined)).toEqual({ first: undefined, more: 0 });
  });
});

describe('relativeTime', () => {
  const now = new Date(2026, 9, 1, 12, 0);
  const ago = (minutes: number) =>
    new Date(now.getTime() - minutes * 60_000).toISOString();

  it('counts minutes, hours and days, then shows the date', () => {
    expect(relativeTime(ago(0), now)).toBe('now');
    expect(relativeTime(ago(5), now)).toBe('5m');
    expect(relativeTime(ago(180), now)).toBe('3h');
    expect(relativeTime(ago(2 * 24 * 60), now)).toBe('2d');
    expect(relativeTime(new Date(2026, 8, 12, 9).toISOString(), now)).toBe(
      '12 Sep'
    );
    expect(relativeTime(undefined, now)).toBe('');
  });
});

describe('timeOfDay', () => {
  it('shows the local 24-hour time', () => {
    expect(timeOfDay(new Date(2026, 9, 1, 8, 5).toISOString())).toBe('08:05');
    expect(timeOfDay(new Date(2026, 9, 1, 17, 40).toISOString())).toBe('17:40');
  });
});

describe('commentCount', () => {
  it('counts replies, and threads not loaded yet', () => {
    const threads = [{ id: 'c1', replies: [{ id: 'c2' }, { id: 'c3' }] }];
    expect(commentCount(threads, 1)).toBe(3);
    expect(commentCount(threads, 4)).toBe(6);
    expect(commentCount([], 0)).toBe(0);
  });
});
