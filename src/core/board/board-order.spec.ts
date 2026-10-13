import type { Task } from '../api';
import { boardIndex, boardOrder, movedOrder } from './board-order';

const task = (id: string, fields: Partial<Task> = {}): Task => ({
  id,
  ...fields,
});

const ids = (tasks: readonly Task[]) => tasks.map((t) => t.id);

describe('boardOrder', () => {
  it('sorts by position, then newest first', () => {
    const tasks = [
      task('a', { position: 2, createdAt: '2026-10-01T00:00:00Z' }),
      task('b', { position: 0, createdAt: '2026-10-01T00:00:00Z' }),
      task('c', { position: 2, createdAt: '2026-10-03T00:00:00Z' }),
      task('d', { position: 1, createdAt: '2026-09-01T00:00:00Z' }),
    ];
    expect(ids(boardOrder(tasks))).toEqual(['b', 'd', 'c', 'a']);
  });

  it('counts a missing position as 0 and keeps ties in their order', () => {
    const tasks = [task('a', { position: 1 }), task('b'), task('c')];
    expect(ids(boardOrder(tasks))).toEqual(['b', 'c', 'a']);
  });

  it('leaves its input alone', () => {
    const tasks = [task('a', { position: 1 }), task('b', { position: 0 })];
    boardOrder(tasks);
    expect(ids(tasks)).toEqual(['a', 'b']);
  });
});

describe('boardIndex', () => {
  const column = [
    task('a', { position: 0 }),
    task('b', { position: 1 }),
    task('c', { position: 3 }),
  ];

  it('finds where the order puts a task', () => {
    expect(boardIndex(column, task('x', { position: 2 }))).toBe(2);
    expect(boardIndex(column, task('x', { position: -1 }))).toBe(0);
    expect(boardIndex(column, task('x', { position: 9 }))).toBe(3);
  });

  it('puts a task after older ties and before newer ones', () => {
    const dated = [
      task('a', { position: 1, createdAt: '2026-10-05T00:00:00Z' }),
      task('b', { position: 1, createdAt: '2026-10-01T00:00:00Z' }),
    ];
    expect(
      boardIndex(
        dated,
        task('x', { position: 1, createdAt: '2026-10-03T00:00:00Z' })
      )
    ).toBe(1);
  });

  it('counts the column without the task itself', () => {
    expect(boardIndex(column, task('a', { position: 2 }))).toBe(1);
    expect(boardIndex(column, task('c', { position: 3 }))).toBe(2);
  });
});

describe('movedOrder', () => {
  it('moves a task to an index counted without it', () => {
    expect(movedOrder(['a', 'b', 'c', 'd'], 'a', 2)).toEqual([
      'b',
      'c',
      'a',
      'd',
    ]);
    expect(movedOrder(['a', 'b', 'c', 'd'], 'd', 0)).toEqual([
      'd',
      'a',
      'b',
      'c',
    ]);
    expect(movedOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
  });

  it('adds a task from another column', () => {
    expect(movedOrder(['a', 'b'], 'x', 1)).toEqual(['a', 'x', 'b']);
    expect(movedOrder(['a', 'b'], 'x', 2)).toEqual(['a', 'b', 'x']);
    expect(movedOrder([], 'x', 0)).toEqual(['x']);
  });

  it('keeps the index inside the column', () => {
    expect(movedOrder(['a', 'b'], 'x', 7)).toEqual(['a', 'b', 'x']);
    expect(movedOrder(['a', 'b'], 'x', -1)).toEqual(['x', 'a', 'b']);
  });
});
