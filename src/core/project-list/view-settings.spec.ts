import {
  aiFilterQuery,
  resolveGroupBy,
  resolveViewMode,
} from './view-settings';

describe('resolveGroupBy', () => {
  it("uses the project's override first", () => {
    expect(resolveGroupBy('priority', 'type')).toBe('priority');
  });

  it("falls back to the account's default", () => {
    expect(resolveGroupBy(null, 'type')).toBe('type');
    expect(resolveGroupBy('', 'none')).toBe('none');
  });

  it('groups by status when neither is set', () => {
    expect(resolveGroupBy(undefined, undefined)).toBe('status');
  });

  it('skips a value it does not know', () => {
    expect(resolveGroupBy('assignee', 'priority')).toBe('priority');
    expect(resolveGroupBy('assignee', 'label')).toBe('status');
  });
});

describe('resolveViewMode', () => {
  it("uses the project's override first", () => {
    expect(resolveViewMode('board', 'list')).toBe('board');
  });

  it("falls back to the account's default view", () => {
    expect(resolveViewMode(null, 'board')).toBe('board');
    expect(resolveViewMode('', 'board')).toBe('board');
  });

  it('shows the list when neither is set', () => {
    expect(resolveViewMode(undefined, undefined)).toBe('list');
  });

  it('skips the calendar, which is not built yet', () => {
    expect(resolveViewMode('calendar', 'board')).toBe('board');
    expect(resolveViewMode('calendar', 'calendar')).toBe('list');
  });
});

describe('aiFilterQuery', () => {
  it('hides AI candidates by default', () => {
    expect(aiFilterQuery(null)).toEqual({ excludeLabel: 'ai:candidate' });
    expect(aiFilterQuery('human-only')).toEqual({
      excludeLabel: 'ai:candidate',
    });
  });

  it('shows only AI candidates with requireLabel', () => {
    expect(aiFilterQuery('ai-only')).toEqual({ requireLabel: 'ai:candidate' });
  });

  it('filters nothing for all', () => {
    expect(aiFilterQuery('all')).toEqual({});
  });
});
