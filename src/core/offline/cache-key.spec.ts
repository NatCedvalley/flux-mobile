import { cacheKey } from './cache-key';

describe('cacheKey', () => {
  it('keys a read by its method and arguments', () => {
    expect(cacheKey('getTask', ['p1', 't1'])).toBe('getTask:["p1","t1"]');
  });

  it('ignores the order of a query’s fields, and an omitted query', () => {
    expect(
      cacheKey('listMyTasks', [
        { scope: 'assigned', openOnly: true, size: 100 },
      ])
    ).toBe(
      cacheKey('listMyTasks', [
        { size: 100, openOnly: true, scope: 'assigned' },
      ])
    );
    expect(cacheKey('listMyProjects', [undefined])).toBe(
      cacheKey('listMyProjects', [])
    );
    expect(cacheKey('notificationUnreadCount', [])).toBe(
      'notificationUnreadCount:[]'
    );
  });

  it('keys Focus without its day', () => {
    const focus = { scope: 'assigned' as const, openOnly: true, size: 100 };
    expect(
      cacheKey('listMyTasks', [{ ...focus, dueDateTo: '2026-10-28' }])
    ).toBe(cacheKey('listMyTasks', [{ ...focus, dueDateTo: '2026-10-29' }]));
    expect(
      cacheKey('listMyTasks', [{ ...focus, dueDateTo: '2026-10-28' }])
    ).not.toBe(cacheKey('listMyTasks', [focus]));
  });

  it('keeps My Work’s segments but not its search', () => {
    expect(
      cacheKey('listMyTasks', [{ scope: 'assigned', openOnly: true }])
    ).not.toBeNull();
    expect(cacheKey('listMyTasks', [{ openOnly: false, size: 50 }])).toBeNull();
    expect(
      cacheKey('listMyTasks', [{ openOnly: true, search: 'login' }])
    ).toBeNull();
    expect(cacheKey('listMyTasks', [{ openOnly: true, page: 1 }])).toBeNull();
  });

  it('keeps the Projects list’s first pages but not the board, calendar or search', () => {
    const list = { status: 'todo', page: 0, size: 50, sort: 'createdAt,desc' };
    expect(cacheKey('listProjectTasks', ['p1', list])).not.toBeNull();
    expect(
      cacheKey('listProjectTasks', ['p1', { ...list, page: 1 }])
    ).toBeNull();
    expect(
      cacheKey('listProjectTasks', ['p1', { ...list, size: 100 }])
    ).toBeNull();
    expect(
      cacheKey('listProjectTasks', ['p1', { ...list, search: 'CHK' }])
    ).toBeNull();
    expect(
      cacheKey('listProjectTasks', [
        'p1',
        { dueDateFrom: '2026-09-28', dueDateTo: '2026-11-08', size: 50 },
      ])
    ).toBeNull();
    expect(
      cacheKey('listProjectTasks', ['p1', { onlyUnscheduled: true, size: 50 }])
    ).toBeNull();
  });

  it.each(['listTaskComments', 'listTaskActivities'] as const)(
    'keeps only the first page of %s',
    (method) => {
      expect(
        cacheKey(method, ['p1', 't1', { page: 0, size: 50 }])
      ).not.toBeNull();
      expect(cacheKey(method, ['p1', 't1', { page: 1, size: 50 }])).toBeNull();
    }
  );

  it('keeps only the Inbox’s first page', () => {
    expect(
      cacheKey('listNotifications', [{ page: 0, size: 30 }])
    ).not.toBeNull();
    expect(cacheKey('listNotifications', [{ page: 1, size: 30 }])).toBeNull();
  });

  it('leaves out reads that aren’t on the list', () => {
    expect(cacheKey('listLabels', ['p1'])).toBeNull();
    expect(cacheKey('pushPreferences', [])).toBeNull();
  });
});
