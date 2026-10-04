import type { TaskActivity } from '../api';
import { activityDays, activityView } from './activity';

const TODAY = '2026-10-01';

describe('activityDays', () => {
  const now = new Date(2026, 9, 1, 12, 0);
  const at = (month: number, day: number, hour: number) => ({
    createdAt: new Date(2026, month, day, hour).toISOString(),
  });

  it('groups entries by local day, in their order', () => {
    const days = activityDays(
      [
        { id: '1', ...at(9, 1, 9) },
        { id: '2', ...at(9, 1, 8) },
        { id: '3', ...at(8, 30, 16) },
        { id: '4', ...at(8, 11, 10) },
      ],
      now
    );
    expect(days.map((d) => d.label)).toEqual([
      'Today',
      'Yesterday',
      'Friday 11 September',
    ]);
    expect(days[0].entries.map((e) => e.id)).toEqual(['1', '2']);
  });

  it("adds the year when it isn't this year", () => {
    const days = activityDays(
      [{ createdAt: new Date(2025, 11, 31, 10).toISOString() }],
      now
    );
    expect(days[0].label).toBe('Wednesday 31 December 2025');
  });
});

describe('activityView', () => {
  const view = (entry: TaskActivity) => activityView(entry, TODAY);

  it('shows a status change as slugs, for status pills', () => {
    expect(
      view({ action: 'STATUS_CHANGED', oldValue: 'todo', newValue: 'done' })
    ).toEqual({
      icon: 'circle-dot',
      tone: 'amber',
      verb: 'changed status',
      change: { kind: 'status', from: 'todo', to: 'done' },
    });
  });

  it('names the person for an assignment', () => {
    expect(
      view({
        action: 'ASSIGNED',
        newValue: '[a1]',
        newValueDisplay: 'Ada Rahman',
      })
    ).toMatchObject({
      icon: 'user',
      verb: 'assigned to',
      target: 'Ada Rahman',
    });
    expect(
      view({ action: 'UNASSIGNED', oldValueDisplay: 'Ben Tan' })
    ).toMatchObject({ verb: 'unassigned', target: 'Ben Tan' });
  });

  it('shows priority changes by their labels', () => {
    expect(
      view({
        action: 'FIELD_UPDATED',
        field: 'priority',
        oldValue: 'HIGH',
        newValue: 'CRITICAL',
      })
    ).toMatchObject({
      icon: 'chevrons-up',
      tone: 'red',
      change: { kind: 'priority', from: 'High', to: 'Critical' },
    });
  });

  it('formats date fields and fills a missing value with none', () => {
    expect(
      view({
        action: 'FIELD_UPDATED',
        field: 'dueDate',
        oldValue: '',
        newValue: '2026-10-12',
      })
    ).toMatchObject({
      icon: 'calendar',
      verb: 'changed the due date',
      change: { kind: 'text', from: 'none', to: '12 Oct' },
    });
  });

  it('describes the other fields', () => {
    expect(view({ action: 'FIELD_UPDATED', field: 'description' })).toEqual({
      icon: 'pencil',
      tone: 'gray',
      verb: 'updated the description',
    });
    expect(
      view({
        action: 'FIELD_UPDATED',
        field: 'status',
        oldValue: 'todo',
        newValue: 'done',
      })
    ).toMatchObject({ verb: 'auto-changed status' });
    expect(
      view({
        action: 'FIELD_UPDATED',
        field: 'type',
        oldValue: 'BUG',
        newValue: 'TASK',
      }).change
    ).toEqual({ kind: 'text', from: 'Bug', to: 'Task' });
    expect(
      view({ action: 'FIELD_UPDATED', field: 'parentTaskId', newValue: 'x' })
    ).toEqual({ icon: 'layers', tone: 'gray', verb: 'changed the parent' });
    expect(
      view({
        action: 'FIELD_UPDATED',
        field: 'affectedVersion',
        oldValue: '1.0',
        newValue: '1.1',
      }).verb
    ).toBe('updated affected version');
  });

  it('covers creation, comments, releases and archiving', () => {
    const verbs = (
      [
        'CREATED',
        'COMMENT_ADDED',
        'COMMENT_EDITED',
        'COMMENT_DELETED',
        'ARCHIVED',
        'UNARCHIVED',
      ] as const
    ).map((action) => view({ action }).verb);
    expect(verbs).toEqual([
      'created this task',
      'added a comment',
      'edited a comment',
      'deleted a comment',
      'archived this task',
      'unarchived this task',
    ]);
    expect(
      view({ action: 'LINKED_TO_RELEASE', newValueDisplay: 'v2.4.0' })
    ).toEqual({
      icon: 'package',
      tone: 'violet',
      verb: 'linked to release',
      target: 'v2.4.0',
    });
  });
});
