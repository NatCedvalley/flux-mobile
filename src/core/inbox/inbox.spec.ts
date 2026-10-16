import type { AppNotification } from '../api';
import { avatarFillIndex } from '../people';
import {
  INBOX_SEGMENTS,
  inboxGroups,
  isMention,
  notificationView,
} from './inbox';

const BEN = { actorId: 'a2', actorFirstName: 'Ben', actorLastName: 'Tan' };

function taskRow(fields: AppNotification): AppNotification {
  return {
    entityType: 'TASK',
    entityId: 't1',
    projectId: 'p1',
    taskKey: 'CHK-142',
    projectName: 'Checkout',
    ...fields,
  };
}

describe('INBOX_SEGMENTS', () => {
  it('filters Mentions and Assigned by type, and All by none', () => {
    expect(INBOX_SEGMENTS.map((s) => [s.key, s.label, s.type])).toEqual([
      ['all', 'All', undefined],
      ['mentions', 'Mentions', 'MENTION,DESCRIPTION_MENTION'],
      ['assigned', 'Assigned', 'ASSIGNMENT'],
    ]);
  });

  it('counts both mention types as mentions', () => {
    expect(isMention({ type: 'MENTION' })).toBe(true);
    expect(isMention({ type: 'DESCRIPTION_MENTION' })).toBe(true);
    expect(isMention({ type: 'COMMENT' })).toBe(false);
  });
});

describe('notificationView', () => {
  it('leads with the actor, then the verb and the subject', () => {
    const view = notificationView(
      taskRow({
        type: 'MENTION',
        message: 'Ben Tan mentioned you in: Fix 3DS redirect on Safari',
        ...BEN,
      })
    );

    expect(view).toEqual({
      lead: 'Ben Tan',
      verb: 'mentioned you in',
      subject: 'Fix 3DS redirect on Safari',
      leading: {
        kind: 'avatar',
        initials: 'BT',
        fillIndex: avatarFillIndex('a2'),
      },
      taskKey: 'CHK-142',
      projectName: 'Checkout',
      opensTask: true,
    });
  });

  it('keeps "and 1 other" in a grouped reaction’s verb', () => {
    const view = notificationView(
      taskRow({
        type: 'REACTION',
        message:
          'Ben Tan and 1 other reacted to your comment on: Fix 3DS redirect',
        ...BEN,
      })
    );

    expect([view.lead, view.verb, view.subject]).toEqual([
      'Ben Tan',
      'and 1 other reacted to your comment on',
      'Fix 3DS redirect',
    ]);
    expect(view.leading.kind).toBe('avatar');
  });

  it('splits at the first ": " only', () => {
    const view = notificationView(
      taskRow({
        type: 'COMMENT',
        message: 'Ben Tan commented on: Docs: write the guide',
        ...BEN,
      })
    );

    expect(view.subject).toBe('Docs: write the guide');
  });

  it.each([
    ['ASSIGNMENT', 'circle-dot', 'amber'],
    ['RELEASE_CREATED', 'package', 'violet'],
    ['TASK_CREATED', 'plus', 'green'],
    ['TASK_ARCHIVED', 'archive', 'gray'],
    ['TASK_RESTORED', 'refresh-cw', 'gray'],
    ['TASK_DELETED', 'trash-2', 'red'],
    ['TASK_UPDATED', 'pencil', 'gray'],
    ['SOMETHING_NEW', 'bell', 'gray'],
  ])('gives %s the %s glyph in %s', (type, icon, tone) => {
    expect(
      notificationView(taskRow({ type, message: 'Ben Tan did: X', ...BEN }))
        .leading
    ).toEqual({ kind: 'glyph', icon, tone });
  });

  it.each([
    ['COMMENT', 'message-circle'],
    ['MENTION', 'at-sign'],
    ['DESCRIPTION_MENTION', 'at-sign'],
    ['REACTION', 'smile-plus'],
  ])('gives %s a glyph when there is no actor', (type, icon) => {
    expect(
      notificationView(taskRow({ type, message: 'Someone did: X' })).leading
    ).toEqual({ kind: 'glyph', icon, tone: 'gray' });
  });

  it('leads with the whole prefix on a row from before FM-42', () => {
    const view = notificationView({
      type: 'ASSIGNMENT',
      message: 'Ben Tan assigned you to: Prorate plan upgrades',
      entityType: 'TASK',
      entityId: 't3',
      projectId: 'p2',
    });

    expect([view.lead, view.verb, view.subject]).toEqual([
      'Ben Tan assigned you to',
      undefined,
      'Prorate plan upgrades',
    ]);
    expect(view.taskKey).toBeUndefined();
    expect(view.opensTask).toBe(false);
  });

  it('leads with the title when the message has no ": "', () => {
    const view = notificationView({
      type: 'TASK_UPDATED',
      title: 'Task updated',
      message: 'Something changed',
    });

    expect([view.lead, view.verb, view.subject]).toEqual([
      'Task updated',
      undefined,
      'Something changed',
    ]);
  });

  it('opens only tasks that still exist', () => {
    const open = (n: AppNotification) => notificationView(n).opensTask;

    expect(open(taskRow({ type: 'COMMENT' }))).toBe(true);
    expect(open(taskRow({ type: 'TASK_DELETED' }))).toBe(false);
    expect(open(taskRow({ type: 'COMMENT', taskKey: undefined }))).toBe(false);
    expect(
      open({
        type: 'RELEASE_CREATED',
        entityType: 'RELEASE',
        entityId: 'r1',
        projectId: 'p1',
        projectName: 'Checkout',
      })
    ).toBe(false);
  });
});

describe('inboxGroups', () => {
  const now = new Date(2026, 9, 15, 0, 30);
  const row = (id: string, createdAt: Date): AppNotification => ({
    id,
    createdAt: createdAt.toISOString(),
  });

  it('splits at local midnight, keeping the server’s order', () => {
    const groups = inboxGroups(
      [
        row('a', new Date(2026, 9, 15, 0, 20)),
        row('b', new Date(2026, 9, 15, 0, 0)),
        row('c', new Date(2026, 9, 14, 23, 59)),
        row('d', new Date(2026, 9, 2, 9, 0)),
      ],
      now
    );

    expect(groups.map((g) => [g.label, g.items.map((n) => n.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Earlier', ['c', 'd']],
    ]);
  });

  it('leaves out an empty group', () => {
    expect(
      inboxGroups([row('c', new Date(2026, 9, 14, 23, 59))], now).map(
        (g) => g.key
      )
    ).toEqual(['earlier']);
    expect(inboxGroups([], now)).toEqual([]);
  });
});
