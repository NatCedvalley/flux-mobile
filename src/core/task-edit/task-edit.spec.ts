import type { Task } from '../api';
import {
  canEditDescription,
  parentTypes,
  taskUpdateBody,
  withChange,
  type TaskChange,
} from './task-edit';

// Every field the server clears when a PUT leaves it out. Listed here rather
// than imported, so dropping one from taskUpdateBody fails these tests.
const PRESERVED = {
  dueDate: '2026-10-20',
  plannedStartDate: '2026-10-01',
  plannedEndDate: '2026-10-31',
  labels: ['safari', 'payments'],
  environment: 'Production',
  affectedVersion: '2.3.0',
  fixVersion: '2.3.1',
  bugOccurredAt: '2026-09-30T08:15:00Z',
  affectedUser: 'ada@example.com',
} as const;

const TASK: Task = {
  id: 't1',
  projectId: 'p1',
  title: 'Safari checkout fails',
  description: 'Steps',
  descriptionFormat: 'MARKDOWN',
  type: 'BUG',
  priority: 'HIGH',
  ...PRESERVED,
  labels: [...PRESERVED.labels],
};

const CHANGES: TaskChange[] = [
  { title: 'New title' },
  { priority: 'LOW' },
  { type: 'TASK' },
  { description: 'New', descriptionFormat: 'MARKDOWN' },
  { dueDate: '2026-11-01' },
];

describe('taskUpdateBody', () => {
  for (const change of CHANGES) {
    it(`sends every untouched field back with ${JSON.stringify(change)}`, () => {
      const body = taskUpdateBody(TASK, change);
      for (const [field, value] of Object.entries(PRESERVED)) {
        if (!(field in change)) {
          expect(body, field).toHaveProperty(field, value);
        }
      }
      expect(body).toMatchObject(change);
    });
  }

  it('clears the due date with an undefined one', () => {
    const body = taskUpdateBody(TASK, { dueDate: undefined });
    expect(body.dueDate).toBeUndefined();
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('dueDate');
    expect(body.fixVersion).toBe('2.3.1');
  });

  it('leaves out the fields the server keeps when they are unchanged', () => {
    const body = taskUpdateBody(TASK, { priority: 'LOW' });
    for (const field of ['title', 'type', 'description', 'descriptionFormat']) {
      expect(body, field).not.toHaveProperty(field);
    }
  });
});

describe('withChange', () => {
  it('shows the change over the task', () => {
    expect(withChange(TASK, { title: 'New' })).toEqual({
      ...TASK,
      title: 'New',
    });
  });
});

describe('parentTypes', () => {
  it('puts a master under a master only', () => {
    expect(parentTypes('MASTER')).toEqual(['MASTER']);
  });

  it('puts anything else under a master or an epic', () => {
    for (const type of ['EPIC', 'BUG', 'TASK'] as const) {
      expect(parentTypes(type)).toEqual(['MASTER', 'EPIC']);
    }
  });
});

describe('canEditDescription', () => {
  it('edits an empty description, whatever its format', () => {
    expect(canEditDescription({})).toBe(true);
    expect(
      canEditDescription({ description: '  ', descriptionFormat: 'HTML' })
    ).toBe(true);
  });

  it('edits Markdown', () => {
    expect(
      canEditDescription({
        description: '**Hi**',
        descriptionFormat: 'MARKDOWN',
      })
    ).toBe(true);
  });

  it('leaves HTML and Editor.js to the web', () => {
    expect(
      canEditDescription({
        description: '<p>Hi</p>',
        descriptionFormat: 'HTML',
      })
    ).toBe(false);
    expect(
      canEditDescription({ description: '{}', descriptionFormat: 'EDITORJS' })
    ).toBe(false);
  });

  it('spots Editor.js JSON stored as Markdown', () => {
    expect(
      canEditDescription({
        description: '{"blocks":[{"type":"paragraph","data":{"text":"Hi"}}]}',
        descriptionFormat: 'MARKDOWN',
      })
    ).toBe(false);
  });
});
