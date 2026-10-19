import type { AppNotification } from '../api';
import { parsePushData, pushTarget } from './push-message';

type NotificationType = NonNullable<AppNotification['type']>;

/** A task push as flux-operations sends it. */
const taskData = (type: NotificationType) => ({
  notificationId: 'n1',
  type,
  entityType: 'TASK',
  entityId: 't1',
  projectId: 'p1',
});

const TASK_TYPES: NotificationType[] = [
  'ASSIGNMENT',
  'TASK_UPDATED',
  'COMMENT',
  'MENTION',
  'DESCRIPTION_MENTION',
  'TASK_CREATED',
  'TASK_ARCHIVED',
  'TASK_RESTORED',
  'REACTION',
];

describe('parsePushData', () => {
  it('reads the fields Flux sends', () => {
    expect(parsePushData(taskData('COMMENT'))).toEqual({
      notificationId: 'n1',
      type: 'COMMENT',
      entityType: 'TASK',
      entityId: 't1',
      projectId: 'p1',
    });
  });

  it("ignores iOS's own keys", () => {
    expect(
      parsePushData({
        ...taskData('COMMENT'),
        aps: { alert: { title: 'Hi' } },
        'gcm.message_id': '123',
      })
    ).toEqual(parsePushData(taskData('COMMENT')));
  });

  it('leaves out entity fields that were not sent', () => {
    expect(
      parsePushData({ notificationId: 'n1', type: 'TASK_DELETED' })
    ).toEqual({
      notificationId: 'n1',
      type: 'TASK_DELETED',
      entityType: undefined,
      entityId: undefined,
      projectId: undefined,
    });
  });

  it('drops fields that are not strings', () => {
    expect(
      parsePushData({ ...taskData('COMMENT'), entityId: 7, projectId: null })
    ).toMatchObject({ entityId: undefined, projectId: undefined });
  });

  it.each([
    ['notificationId', { ...taskData('COMMENT'), notificationId: undefined }],
    ['notificationId', { ...taskData('COMMENT'), notificationId: '' }],
    ['type', { ...taskData('COMMENT'), type: undefined }],
  ])('is null without %s', (_, data) => {
    expect(parsePushData(data)).toBeNull();
  });

  it.each([undefined, null, 'COMMENT', 42])('is null for %s', (data) => {
    expect(parsePushData(data)).toBeNull();
  });
});

describe('pushTarget', () => {
  it.each(TASK_TYPES)('opens the task for %s', (type) => {
    expect(pushTarget(parsePushData(taskData(type)))).toEqual({
      kind: 'task',
      projectId: 'p1',
      taskId: 't1',
    });
  });

  it('opens the Inbox for a release', () => {
    expect(
      pushTarget(
        parsePushData({
          notificationId: 'n1',
          type: 'RELEASE_CREATED',
          entityType: 'RELEASE',
          entityId: 'r1',
          projectId: 'p1',
        })
      )
    ).toEqual({ kind: 'inbox' });
  });

  it('opens the Inbox for a deleted task', () => {
    expect(
      pushTarget(parsePushData({ notificationId: 'n1', type: 'TASK_DELETED' }))
    ).toEqual({ kind: 'inbox' });
    // Even if the server ever sent its old ids.
    expect(pushTarget(parsePushData(taskData('TASK_DELETED')))).toEqual({
      kind: 'inbox',
    });
  });

  it.each(['entityType', 'entityId', 'projectId'])(
    'opens the Inbox without %s',
    (field) => {
      const data: Record<string, string> = taskData('COMMENT');
      delete data[field];
      expect(pushTarget(parsePushData(data))).toEqual({ kind: 'inbox' });
    }
  );

  it('opens the Inbox for data it could not read', () => {
    expect(pushTarget(null)).toEqual({ kind: 'inbox' });
  });
});
