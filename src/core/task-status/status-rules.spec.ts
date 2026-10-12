import type { Task, WorkflowStatus } from '../api';
import {
  allowedStatusCategories,
  blockedReason,
  dropAction,
  nextStatus,
  statusSheetGroups,
  withStatus,
  workflowOrder,
} from './status-rules';

const CATEGORY_POSITIONS = { PLANNING: 0, TODO: 1, IN_PROGRESS: 2, DONE: 3 };

// Out of order on purpose: workflowOrder sorts them.
const STATUSES: WorkflowStatus[] = [
  { slug: 'done', name: 'Done', category: 'DONE', position: 0, isClosed: true },
  { slug: 'review', name: 'In Review', category: 'IN_PROGRESS', position: 2 },
  { slug: 'backlog', name: 'Backlog', category: 'PLANNING', position: 0 },
  { slug: 'todo', name: 'To Do', category: 'TODO', position: 0 },
  { slug: 'doing', name: 'In Progress', category: 'IN_PROGRESS', position: 1 },
];

const ORDERED = workflowOrder(STATUSES, CATEGORY_POSITIONS);
const slugs = (statuses: readonly WorkflowStatus[]) =>
  statuses.map((s) => s.slug);

describe('workflowOrder', () => {
  it('orders by category position, then position', () => {
    expect(slugs(ORDERED)).toEqual([
      'backlog',
      'todo',
      'doing',
      'review',
      'done',
    ]);
  });

  it('follows a project’s own category order, a missing category last', () => {
    expect(
      slugs(workflowOrder(STATUSES, { DONE: 0, TODO: 1, IN_PROGRESS: 2 }))
    ).toEqual(['done', 'todo', 'doing', 'review', 'backlog']);
  });

  it('drops statuses without a slug', () => {
    expect(workflowOrder([{ name: 'Broken', category: 'TODO' }])).toEqual([]);
  });
});

describe('allowedStatusCategories', () => {
  it('lets masters and epics be planned or done', () => {
    expect(allowedStatusCategories('EPIC')).toEqual(['PLANNING', 'DONE']);
    expect(allowedStatusCategories('MASTER')).toEqual(['PLANNING', 'DONE']);
  });

  it('lets other tasks be to do, in progress or done', () => {
    for (const type of ['BUG', 'FEATURE', 'TASK', 'IMPROVEMENT'] as const) {
      expect(allowedStatusCategories(type)).toEqual([
        'TODO',
        'IN_PROGRESS',
        'DONE',
      ]);
    }
  });
});

describe('blockedReason', () => {
  it('allows the categories the type may use', () => {
    expect(blockedReason('BUG', 'IN_PROGRESS')).toBeUndefined();
    expect(blockedReason('EPIC', 'PLANNING')).toBeUndefined();
    expect(blockedReason('TASK', 'DONE')).toBeUndefined();
  });

  it('keeps planning statuses for containers', () => {
    expect(blockedReason('TASK', 'PLANNING')).toBe('Epics and masters only');
  });

  it('keeps containers out of work statuses', () => {
    expect(blockedReason('EPIC', 'TODO')).toBe('Not for epics');
    expect(blockedReason('MASTER', 'IN_PROGRESS')).toBe('Not for masters');
  });
});

describe('nextStatus', () => {
  it('is the next status in workflow order', () => {
    expect(nextStatus(ORDERED, { status: 'doing', type: 'BUG' })?.slug).toBe(
      'review'
    );
  });

  it('moves a leaf task out of planning to the first status it may use', () => {
    expect(nextStatus(ORDERED, { status: 'backlog', type: 'TASK' })?.slug).toBe(
      'todo'
    );
  });

  it('skips the statuses a container may not use', () => {
    expect(nextStatus(ORDERED, { status: 'backlog', type: 'EPIC' })?.slug).toBe(
      'done'
    );
  });

  it('is undefined at the end of the workflow', () => {
    expect(
      nextStatus(ORDERED, { status: 'done', type: 'TASK' })
    ).toBeUndefined();
  });

  it('is undefined for a status not in the workflow', () => {
    expect(
      nextStatus(ORDERED, { status: 'gone', type: 'TASK' })
    ).toBeUndefined();
  });
});

describe('statusSheetGroups', () => {
  it('groups statuses by category, marking current, suggested and blocked', () => {
    const groups = statusSheetGroups(ORDERED, { status: 'todo', type: 'BUG' });

    expect(groups.map((g) => g.label)).toEqual([
      'Planning',
      'To do',
      'In progress',
      'Done',
    ]);
    expect(
      groups.flatMap((g) =>
        g.rows.map((r) => ({
          slug: r.status.slug,
          current: r.current,
          suggested: r.suggested,
          blocked: r.blocked,
          needsResolution: r.needsResolution,
        }))
      )
    ).toEqual([
      {
        slug: 'backlog',
        current: false,
        suggested: false,
        blocked: 'Epics and masters only',
        needsResolution: false,
      },
      {
        slug: 'todo',
        current: true,
        suggested: false,
        blocked: undefined,
        needsResolution: false,
      },
      {
        slug: 'doing',
        current: false,
        suggested: true,
        blocked: undefined,
        needsResolution: false,
      },
      {
        slug: 'review',
        current: false,
        suggested: false,
        blocked: undefined,
        needsResolution: false,
      },
      {
        slug: 'done',
        current: false,
        suggested: false,
        blocked: undefined,
        needsResolution: true,
      },
    ]);
  });

  it('never marks the current status as blocked', () => {
    const [planning] = statusSheetGroups(ORDERED, {
      status: 'backlog',
      type: 'TASK',
    });
    expect(planning.rows[0]).toMatchObject({
      current: true,
      blocked: undefined,
    });
  });
});

describe('dropAction', () => {
  const status = (slug: string) => STATUSES.find((s) => s.slug === slug)!;
  const task: Task = { status: 'todo', type: 'TASK' };

  it("does nothing on the card's own column", () => {
    expect(dropAction(task, status('todo'))).toBe('same');
  });

  it('refuses a column the type cannot use', () => {
    expect(dropAction(task, status('backlog'))).toBe('blocked');
    expect(
      dropAction({ status: 'backlog', type: 'EPIC' }, status('todo'))
    ).toBe('blocked');
  });

  it('asks for a resolution on a closed status', () => {
    expect(dropAction(task, status('done'))).toBe('resolution');
  });

  it('moves to any other status', () => {
    expect(dropAction(task, status('review'))).toBe('move');
    expect(
      dropAction({ status: 'backlog', type: 'EPIC' }, status('done'))
    ).toBe('resolution');
  });
});

describe('withStatus', () => {
  const task: Task = {
    id: 't1',
    status: 'done',
    statusCategory: 'DONE',
    isClosedStatus: true,
    resolution: 'fixed',
    assignees: [{ accountId: 'a1' }],
  };

  it('moves the task, keeping its other fields', () => {
    expect(withStatus(task, ORDERED[2])).toEqual({
      ...task,
      status: 'doing',
      statusCategory: 'IN_PROGRESS',
      isClosedStatus: false,
      resolution: undefined,
    });
  });

  it('carries the resolution into a closed status', () => {
    const open = withStatus(task, ORDERED[1]);
    expect(withStatus(open, ORDERED[4], 'wont-do')).toMatchObject({
      status: 'done',
      isClosedStatus: true,
      resolution: 'wont-do',
    });
  });
});
