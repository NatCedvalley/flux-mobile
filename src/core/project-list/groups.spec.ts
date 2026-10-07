import type { WorkflowStatus } from '../api';
import { statusHue, taskGroupKey, taskGroups } from './groups';

const STATUSES: WorkflowStatus[] = [
  { slug: 'done', name: 'Done', category: 'DONE', position: 3, color: 'green' },
  {
    slug: 'review',
    name: 'In Review',
    category: 'IN_PROGRESS',
    position: 2,
    color: 'purple',
  },
  { slug: 'todo', name: 'To Do', category: 'TODO', position: 0 },
  {
    slug: 'doing',
    name: 'Doing',
    category: 'IN_PROGRESS',
    position: 1,
    color: 'amber',
  },
];

describe('statusHue', () => {
  it("uses the status's colour when the theme has it", () => {
    expect(statusHue('purple', 'IN_PROGRESS')).toBe('purple');
    expect(statusHue('neutral', 'TODO')).toBe('gray');
  });

  it("falls back to the category's hue", () => {
    expect(statusHue('teal', 'IN_PROGRESS')).toBe('amber');
    expect(statusHue(undefined, 'TODO')).toBe('blue');
    expect(statusHue(undefined, 'DONE')).toBe('green');
    expect(statusHue(undefined, undefined)).toBe('gray');
  });
});

describe('taskGroups', () => {
  it('orders status groups by category position, then position', () => {
    const groups = taskGroups('status', STATUSES, {
      TODO: 0,
      IN_PROGRESS: 1,
      DONE: 2,
    });

    expect(groups.map((g) => g.key)).toEqual([
      'todo',
      'doing',
      'review',
      'done',
    ]);
    expect(groups[2]).toEqual({
      key: 'review',
      label: 'In Review',
      hue: 'purple',
      query: { status: 'review' },
    });
  });

  it('puts a category with no position last', () => {
    const groups = taskGroups('status', STATUSES, { DONE: 0, TODO: 1 });
    expect(groups.map((g) => g.key)).toEqual([
      'done',
      'todo',
      'doing',
      'review',
    ]);
  });

  it('groups by priority, most urgent first', () => {
    const groups = taskGroups('priority', STATUSES);
    expect(groups.map((g) => [g.label, g.query])).toEqual([
      ['Critical', { priority: 'CRITICAL' }],
      ['High', { priority: 'HIGH' }],
      ['Medium', { priority: 'MEDIUM' }],
      ['Low', { priority: 'LOW' }],
    ]);
  });

  it("groups by type in the web's order", () => {
    expect(taskGroups('type', []).map((g) => g.label)).toEqual([
      'Master',
      'Epic',
      'Bug',
      'Feature',
      'Task',
      'Improvement',
    ]);
  });

  it('has one unlabelled, unfiltered group when ungrouped', () => {
    expect(taskGroups('none', STATUSES)).toEqual([
      { key: 'all', label: null, hue: 'gray', query: {} },
    ]);
  });
});

describe('taskGroupKey', () => {
  const task = { status: 'review', priority: 'HIGH', type: 'BUG' } as const;

  it("matches the key of the task's group", () => {
    expect(taskGroupKey('status', task)).toBe('review');
    expect(taskGroupKey('priority', task)).toBe('HIGH');
    expect(taskGroupKey('type', task)).toBe('BUG');
    expect(taskGroupKey('none', task)).toBe('all');
  });
});
