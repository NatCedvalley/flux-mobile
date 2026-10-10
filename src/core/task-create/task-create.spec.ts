import type { WorkflowStatus } from '../api';
import {
  afterCreate,
  allowedChildTypes,
  createTaskBody,
  createdStatus,
  defaultsCallout,
  emptyDraft,
  startingStatus,
  TASK_TYPES,
  withProject,
  type TaskDraft,
} from './task-create';

const STATUSES: WorkflowStatus[] = [
  { slug: 'review', name: 'Review', category: 'IN_PROGRESS', position: 3 },
  { slug: 'backlog', name: 'Backlog', category: 'PLANNING', position: 0 },
  { slug: 'todo', name: 'To Do', category: 'TODO', position: 1 },
  { slug: 'doing', name: 'Doing', category: 'IN_PROGRESS', position: 2 },
  { slug: 'done', name: 'Done', category: 'DONE', position: 4 },
];

const FULL: TaskDraft = {
  projectId: 'p1',
  type: 'BUG',
  title: '  Safari fails  ',
  description: '  Steps  ',
  assigneeId: 'a2',
  priority: 'HIGH',
  dueDate: '2026-10-20',
  labelNames: ['safari'],
  parent: { id: '6', taskKey: 'CHK-120', title: 'Epic', type: 'EPIC' },
};

describe('allowedChildTypes', () => {
  it('allows every type at the root and under a master', () => {
    expect(allowedChildTypes(undefined)).toEqual(TASK_TYPES);
    expect(allowedChildTypes('MASTER')).toEqual(TASK_TYPES);
  });

  it('allows anything but a master under an epic', () => {
    expect(allowedChildTypes('EPIC')).toEqual([
      'TASK',
      'BUG',
      'FEATURE',
      'IMPROVEMENT',
      'EPIC',
    ]);
  });

  it('allows nothing under a leaf', () => {
    expect(allowedChildTypes('BUG')).toEqual([]);
  });
});

describe('startingStatus', () => {
  it('starts a leaf in the default status when its category fits', () => {
    const statuses = STATUSES.map((s) =>
      s.slug === 'doing' ? { ...s, isDefault: true } : s
    );
    expect(startingStatus(statuses, 'BUG')?.slug).toBe('doing');
  });

  it('ignores a default a container can’t use', () => {
    const statuses = STATUSES.map((s) =>
      s.slug === 'todo' ? { ...s, isDefault: true } : s
    );
    expect(startingStatus(statuses, 'EPIC')?.slug).toBe('backlog');
  });

  it('falls back to the first to-do or in-progress status by position', () => {
    expect(startingStatus(STATUSES, 'TASK')?.slug).toBe('todo');
    const noTodo = STATUSES.filter((s) => s.category !== 'TODO');
    expect(startingStatus(noTodo, 'TASK')?.slug).toBe('doing');
  });

  it('starts a container in the first planning status', () => {
    expect(startingStatus(STATUSES, 'MASTER')?.slug).toBe('backlog');
  });

  it('has none when no status fits', () => {
    const noPlanning = STATUSES.filter((s) => s.category !== 'PLANNING');
    expect(startingStatus(noPlanning, 'EPIC')).toBeUndefined();
  });
});

describe('drafts', () => {
  it('starts blank as a task', () => {
    expect(emptyDraft('p1')).toEqual({
      projectId: 'p1',
      type: 'TASK',
      title: '',
      description: '',
      labelNames: [],
    });
  });

  it('drops the assignee, labels and parent on a project change', () => {
    expect(withProject(FULL, 'p2')).toEqual({
      ...FULL,
      projectId: 'p2',
      assigneeId: undefined,
      labelNames: [],
      parent: undefined,
    });
    expect(withProject(FULL, 'p1')).toBe(FULL);
  });

  it('keeps the project and type after a create', () => {
    expect(afterCreate(FULL)).toEqual({ ...emptyDraft('p1'), type: 'BUG' });
  });
});

describe('createTaskBody', () => {
  it('sends every set field, trimmed, with a Markdown description', () => {
    expect(createTaskBody(FULL)).toEqual({
      title: 'Safari fails',
      type: 'BUG',
      description: 'Steps',
      descriptionFormat: 'MARKDOWN',
      priority: 'HIGH',
      assigneeId: 'a2',
      dueDate: '2026-10-20',
      parentTaskId: '6',
    });
  });

  it('leaves out unset fields, so the server’s defaults apply', () => {
    expect(
      createTaskBody({ ...emptyDraft('p1'), title: 'x', description: ' ' })
    ).toEqual({ title: 'x', type: 'TASK' });
  });
});

describe('defaultsCallout', () => {
  it('names the starting status and the assignee', () => {
    expect(defaultsCallout('BUG', 'To Do', undefined)).toEqual({
      lead: 'This bug will start in',
      status: 'To Do',
      tail: ', unassigned.',
    });
    expect(defaultsCallout('EPIC', 'Backlog', 'you').tail).toBe(
      ', assigned to you.'
    );
  });

  it('adds the note when there is one', () => {
    expect(
      defaultsCallout('BUG', 'To Do', undefined, 'Backlog: no.').note
    ).toBe('Backlog: no.');
  });
});

describe('createdStatus', () => {
  const status = (slug: string) => STATUSES.find((s) => s.slug === slug)!;

  it('is the starting status without a target', () => {
    expect(createdStatus(STATUSES, 'BUG')).toEqual({ status: status('todo') });
  });

  it('is the target column when the type may use it', () => {
    expect(createdStatus(STATUSES, 'BUG', status('review'))).toEqual({
      status: status('review'),
    });
    expect(createdStatus(STATUSES, 'EPIC', status('backlog'))).toEqual({
      status: status('backlog'),
    });
  });

  it('says why the type stays in its starting status', () => {
    expect(createdStatus(STATUSES, 'TASK', status('backlog'))).toEqual({
      status: status('todo'),
      refused: 'Backlog: epics and masters only.',
    });
    expect(createdStatus(STATUSES, 'EPIC', status('doing'))).toEqual({
      status: status('backlog'),
      refused: 'Doing: not for epics.',
    });
  });
});
