import { ApiError } from '../auth/api-error';
import { InMemoryFluxApi } from '../mock/in-memory-flux-api';
import { MemoryCacheStore } from './cache-store';
import {
  POSTED_CLOCK_SKEW_MS,
  WriteQueue,
  type CommentRequest,
  type QueuedStatus,
  type QueuedStatusChange,
  type StatusChangeRequest,
} from './write-queue';

const IN_PROGRESS: QueuedStatus = {
  slug: 'in_progress',
  name: 'In Progress',
  category: 'IN_PROGRESS',
};
const TODO: QueuedStatus = { slug: 'todo', name: 'To Do', category: 'TODO' };
const BACKLOG: QueuedStatus = {
  slug: 'backlog',
  name: 'Backlog',
  category: 'PLANNING',
};
const DONE: QueuedStatus = {
  slug: 'done',
  name: 'Done',
  category: 'DONE',
  isClosed: true,
  resolution: 'done',
};

/** CHK-142 (in progress in the in-memory backend) moved from `from` to `to`. */
function change(
  to: QueuedStatus,
  from: QueuedStatus = IN_PROGRESS,
  taskId = '1'
): StatusChangeRequest {
  return { projectId: 'p1', taskId, taskKey: 'CHK-142', from, to };
}

/** A comment on CHK-142. */
function comment(body = 'On my way', attempted = false): CommentRequest {
  return {
    projectId: 'p1',
    taskId: '1',
    taskKey: 'CHK-142',
    body,
    mentionedAccountIds: [],
    attempted,
  };
}

describe('WriteQueue', () => {
  let store: MemoryCacheStore;
  let queue: WriteQueue;
  let api: InMemoryFluxApi;

  /** Someone else closes CHK-142 meanwhile. */
  async function closeOnServer(): Promise<void> {
    await api.changeTaskStatus('p1', '1', {
      status: 'done',
      resolution: 'done',
    });
  }

  /** The queue's `i`th item, a status change. */
  const status = (i = 0) => queue.items[i] as QueuedStatusChange;

  beforeEach(async () => {
    store = new MemoryCacheStore();
    queue = new WriteQueue(store);
    api = new InMemoryFluxApi();
    await queue.load('a1');
  });

  describe('queueing', () => {
    it('keeps changes in order', async () => {
      await queue.enqueueStatus(change(DONE));
      await queue.enqueueStatus(change(TODO, TODO, '2'));
      await queue.enqueueStatus(change(BACKLOG, TODO, '2'));

      expect(queue.items.map((i) => i.taskId)).toEqual(['1', '2']);
      expect(queue.items.every((i) => i.state === 'queued')).toBe(true);
    });

    it('merges changes to a task: first from, last to', async () => {
      await queue.enqueueStatus(change(TODO));
      await queue.enqueueStatus(change(DONE, TODO));

      expect(queue.items).toHaveLength(1);
      expect(status().from.slug).toBe('in_progress');
      expect(status().to).toEqual(DONE);
    });

    it('drops a change that is back where it started (Undo)', async () => {
      await queue.enqueueStatus(change(TODO));
      await queue.enqueueStatus(change(IN_PROGRESS, TODO));

      expect(queue.items).toEqual([]);
    });

    it('keeps a closed status’s change when only the resolution differs', async () => {
      await queue.enqueueStatus(change(IN_PROGRESS, DONE));
      await queue.enqueueStatus(
        change({ ...DONE, resolution: 'wont-do' }, IN_PROGRESS)
      );

      expect(status().to.resolution).toBe('wont-do');
    });

    it('drops the resolution of an open status', async () => {
      await queue.enqueueStatus(change({ ...TODO, resolution: 'done' }));

      expect(status().to.resolution).toBeUndefined();
    });

    it('replaces a conflict with the newer change', async () => {
      await closeOnServer();
      await queue.enqueueStatus(change(TODO));
      await queue.replay(api);
      expect(queue.items[0].state).toBe('conflict');

      await queue.enqueueStatus(change(TODO, DONE));

      expect(queue.items).toHaveLength(1);
      expect(queue.items[0]).toMatchObject({ state: 'queued', from: DONE });
    });

    it('refuses without an account', async () => {
      await queue.load(undefined);

      expect(await queue.enqueueStatus(change(TODO))).toBe(false);
      expect(queue.items).toEqual([]);
    });

    it('reports every change', async () => {
      const listener = vi.fn();
      queue.onChange(listener);

      await queue.enqueueStatus(change(TODO));

      expect(listener).toHaveBeenLastCalledWith([
        expect.objectContaining({ taskId: '1' }),
      ]);
    });
  });

  describe('lookups', () => {
    it('gives a queued change’s status, but not a conflict’s', async () => {
      await queue.enqueueStatus(change(TODO));
      expect(queue.queuedStatus('1')).toEqual(TODO);
      expect(queue.pending('1')?.state).toBe('queued');

      await closeOnServer();
      await queue.replay(api);

      expect(queue.queuedStatus('1')).toBeUndefined();
      expect(queue.pending('1')?.state).toBe('conflict');
    });

    it('leaves out a failed change', async () => {
      vi.spyOn(api, 'getTask').mockRejectedValue(new ApiError(404));
      await queue.enqueueStatus(change(TODO));
      await queue.replay(api);

      expect(queue.items[0].state).toBe('failed');
      expect(queue.pending('1')).toBeUndefined();
    });
  });

  describe('comments', () => {
    it('queues each comment after everything already queued', async () => {
      await queue.enqueueStatus(change(TODO));
      expect(await queue.enqueueComment(comment('One'))).toBe(true);
      await queue.enqueueComment(comment('Two'));

      expect(
        queue.items.map((i) => (i.kind === 'comment' ? i.body : i.kind))
      ).toEqual(['status', 'One', 'Two']);
      expect(queue.items[1]).toMatchObject({
        kind: 'comment',
        state: 'queued',
        taskKey: 'CHK-142',
      });
      expect(queue.commentPending('1')).toBe(true);
      expect(queue.commentPending('2')).toBe(false);
    });

    it('leaves the task’s status lookups and merges alone', async () => {
      await queue.enqueueStatus(change(TODO));
      await queue.enqueueComment(comment());
      await queue.enqueueStatus(change(DONE, TODO));

      expect(queue.items.map((i) => i.kind)).toEqual(['status', 'comment']);
      expect(queue.queuedStatus('1')).toEqual(DONE);
      expect(queue.pending('1')?.kind).toBe('status');

      await queue.enqueueStatus(change(IN_PROGRESS, DONE));
      expect(queue.items.map((i) => i.kind)).toEqual(['comment']);
      expect(queue.queuedStatus('1')).toBeUndefined();
    });

    it('refuses without an account', async () => {
      await queue.load(undefined);

      expect(await queue.enqueueComment(comment())).toBe(false);
      expect(queue.items).toEqual([]);
    });

    it('discards a failed comment, and nothing else', async () => {
      vi.spyOn(api, 'addTaskComment').mockRejectedValueOnce(
        new ApiError(403, { message: 'Nope' })
      );
      await queue.enqueueComment(comment('One'));
      await queue.replay(api);
      await queue.enqueueComment(comment('Two'));
      const [failed, queued] = queue.items;

      await queue.discard(queued.id);
      await queue.discard(failed.id);

      expect(queue.items).toEqual([queued]);
    });

    it('loads items saved before comments as status changes', async () => {
      await store.write(
        'write-queue.a1.json',
        JSON.stringify({
          items: [
            {
              id: 'x',
              projectId: 'p1',
              taskId: '1',
              from: IN_PROGRESS,
              to: TODO,
              state: 'queued',
              queuedAt: 1,
            },
          ],
        })
      );
      const again = new WriteQueue(store);
      await again.load('a1');

      expect(again.items[0].kind).toBe('status');
      expect(again.queuedStatus('1')).toEqual(TODO);
    });

    it('marks a comment that was sending as attempted when loaded', async () => {
      await queue.enqueueComment(comment());
      vi.spyOn(api, 'addTaskComment').mockImplementationOnce(async () => {
        // Killed mid-send: another instance loads the saved blob.
        const again = new WriteQueue(store);
        await again.load('a1');
        expect(again.items[0]).toMatchObject({
          state: 'queued',
          attempted: true,
        });
        throw new ApiError(0);
      });

      await queue.replay(api);
    });
  });

  describe('persistence', () => {
    it('survives a new instance, per account', async () => {
      await queue.enqueueStatus(change(TODO));

      const again = new WriteQueue(store);
      await again.load('a1');
      expect(again.items).toEqual(queue.items);

      await again.load('a2');
      expect(again.items).toEqual([]);
      await again.load('a1');
      expect(again.items).toHaveLength(1);
    });

    it('keeps an account’s changes when no one is signed in', async () => {
      await queue.enqueueStatus(change(TODO));
      await queue.load(undefined);
      expect(queue.items).toEqual([]);

      await queue.load('a1');
      expect(queue.items).toHaveLength(1);
    });

    it('puts a change that was sending back in the queue', async () => {
      await queue.enqueueStatus(change(TODO));
      const saved = JSON.parse((await store.read('write-queue.a1.json'))!);
      saved.items[0].state = 'sending';
      await store.write('write-queue.a1.json', JSON.stringify(saved));

      const again = new WriteQueue(store);
      await again.load('a1');

      expect(again.items[0].state).toBe('queued');
    });

    it('reads an unreadable blob as no changes', async () => {
      await store.write('write-queue.a1.json', '{nope');
      const again = new WriteQueue(store);
      await again.load('a1');

      expect(again.items).toEqual([]);
    });

    it('removes the blob once nothing is queued', async () => {
      await queue.enqueueStatus(change(TODO));
      await queue.replay(api);

      expect(await store.read('write-queue.a1.json')).toBeUndefined();
    });
  });

  describe('replay', () => {
    it('sends a change whose task still has its from status', async () => {
      const send = vi.spyOn(api, 'changeTaskStatus');
      await queue.enqueueStatus(change(DONE));

      const outcomes = await queue.replay(api);

      expect(send).toHaveBeenCalledWith('p1', '1', {
        status: 'done',
        resolution: 'done',
      });
      expect(outcomes.map((o) => o.kind)).toEqual(['sent']);
      expect((await api.getTask('p1', '1')).status).toBe('done');
      expect(queue.items).toEqual([]);
    });

    it('sends no resolution with an open status', async () => {
      const send = vi.spyOn(api, 'changeTaskStatus');
      await queue.enqueueStatus(change(TODO));

      await queue.replay(api);

      expect(send).toHaveBeenCalledWith('p1', '1', {
        status: 'todo',
        resolution: undefined,
      });
    });

    it('drops a change the server already has', async () => {
      await api.changeTaskStatus('p1', '1', { status: 'todo' });
      const send = vi.spyOn(api, 'changeTaskStatus');
      await queue.enqueueStatus(change(TODO));

      const outcomes = await queue.replay(api);

      expect(send).not.toHaveBeenCalled();
      expect(outcomes.map((o) => o.kind)).toEqual(['already']);
      expect(queue.items).toEqual([]);
    });

    it('makes a conflict of a task changed meanwhile, and doesn’t send it', async () => {
      await closeOnServer();
      const send = vi.spyOn(api, 'changeTaskStatus');
      await queue.enqueueStatus(change(TODO));

      const [outcome] = await queue.replay(api);

      expect(send).not.toHaveBeenCalled();
      expect(outcome.kind).toBe('conflict');
      expect(outcome.kind === 'conflict' && outcome.task.status).toBe('done');
      expect(queue.items[0].state).toBe('conflict');
    });

    it.each([400, 403, 404, 422])(
      'makes a failed item of a %i, with the server’s message',
      async (status) => {
        vi.spyOn(api, 'changeTaskStatus').mockRejectedValue(
          new ApiError(status, { message: 'Nope' })
        );
        await queue.enqueueStatus(change(TODO));

        const [outcome] = await queue.replay(api);

        expect(outcome.kind).toBe('failed');
        expect(queue.items[0]).toMatchObject({
          state: 'failed',
          message: 'Nope',
        });
      }
    );

    it.each([0, 503])(
      'stops at a %i and keeps the change queued',
      async (status) => {
        await queue.enqueueStatus(change(TODO));
        await queue.enqueueStatus(change(DONE, TODO, '2'));
        const send = vi
          .spyOn(api, 'changeTaskStatus')
          .mockRejectedValue(new ApiError(status));

        const outcomes = await queue.replay(api);

        expect(outcomes).toEqual([]);
        expect(send).toHaveBeenCalledTimes(1);
        expect(queue.items.map((i) => i.state)).toEqual(['queued', 'queued']);
      }
    );

    it('stops when the session has ended', async () => {
      await queue.enqueueStatus(change(TODO));
      vi.spyOn(api, 'getTask').mockRejectedValue(
        new ApiError(401, { code: 'TOKEN_REVOKED' })
      );

      expect(await queue.replay(api)).toEqual([]);
      expect(queue.items[0].state).toBe('queued');
    });

    it('sends in order, skipping conflicts and failures', async () => {
      await queue.enqueueStatus(change(DONE, TODO, '2'));
      await queue.enqueueStatus(change(TODO));
      vi.spyOn(api, 'getTask').mockRejectedValueOnce(new ApiError(404));
      await queue.replay(api);
      expect(queue.items.map((i) => i.state)).toEqual(['failed']);
      await queue.enqueueStatus(change(DONE, TODO));
      const send = vi.spyOn(api, 'changeTaskStatus');

      await queue.replay(api);

      expect(send).toHaveBeenCalledTimes(1);
      expect(queue.items.map((i) => i.state)).toEqual(['failed']);
    });

    it('marks the change sending while it is on its way', async () => {
      await queue.enqueueStatus(change(TODO));
      let state: string | undefined;
      vi.spyOn(api, 'getTask').mockImplementation(async (p, t) => {
        state = queue.items[0].state;
        return new InMemoryFluxApi().getTask(p, t);
      });

      await queue.replay(api);

      expect(state).toBe('sending');
    });

    it('queues a change made while sending after it', async () => {
      await queue.enqueueStatus(change(TODO));
      vi.spyOn(api, 'getTask').mockImplementationOnce(async (p, t) => {
        await queue.enqueueStatus(change(DONE, TODO));
        return new InMemoryFluxApi().getTask(p, t);
      });

      await queue.replay(api);

      expect((await api.getTask('p1', '1')).status).toBe('done');
      expect(queue.items).toEqual([]);
    });

    it('posts a comment as Markdown with its mentions', async () => {
      const add = vi.spyOn(api, 'addTaskComment');
      const list = vi.spyOn(api, 'listTaskComments');
      await queue.enqueueComment({
        ...comment('Hi @Ben Tan'),
        mentionedAccountIds: ['a2'],
      });

      const [outcome] = await queue.replay(api);

      expect(list).not.toHaveBeenCalled();
      expect(add).toHaveBeenCalledWith('p1', '1', {
        body: 'Hi @Ben Tan',
        bodyFormat: 'MARKDOWN',
        mentionedAccountIds: ['a2'],
      });
      expect(outcome).toMatchObject({
        kind: 'sent',
        comment: { body: 'Hi @Ben Tan', authorId: 'a1' },
      });
      expect(queue.items).toEqual([]);
    });

    it('sends comments and status changes in the order they were made', async () => {
      const calls: string[] = [];
      const add = api.addTaskComment.bind(api);
      const move = api.changeTaskStatus.bind(api);
      vi.spyOn(api, 'addTaskComment').mockImplementation((p, t, c) => {
        calls.push(c.body);
        return add(p, t, c);
      });
      vi.spyOn(api, 'changeTaskStatus').mockImplementation((p, t, s) => {
        calls.push(s.status ?? '');
        return move(p, t, s);
      });
      await queue.enqueueComment(comment('First'));
      await queue.enqueueStatus(change(TODO));
      await queue.enqueueComment(comment('Last'));

      await queue.replay(api);

      expect(calls).toEqual(['First', 'todo', 'Last']);
    });

    it.each([403, 404, 422])(
      'makes a failed comment of a %i, with the server’s message',
      async (code) => {
        vi.spyOn(api, 'addTaskComment').mockRejectedValue(
          new ApiError(code, { message: 'Task is archived' })
        );
        await queue.enqueueComment(comment());

        const [outcome] = await queue.replay(api);

        expect(outcome.kind).toBe('failed');
        expect(queue.items[0]).toMatchObject({
          kind: 'comment',
          state: 'failed',
          message: 'Task is archived',
        });
        expect(queue.commentPending('1')).toBe(false);
      }
    );

    it.each([0, 503])(
      'keeps a comment queued and attempted after a %i',
      async (code) => {
        vi.spyOn(api, 'addTaskComment').mockRejectedValue(new ApiError(code));
        await queue.enqueueComment(comment());

        expect(await queue.replay(api)).toEqual([]);
        expect(queue.items[0]).toMatchObject({
          state: 'queued',
          attempted: true,
        });
      }
    );

    it('doesn’t post again an attempted comment the server already has', async () => {
      const posted = await api.addTaskComment('p1', '1', {
        body: 'On my way',
      });
      const add = vi.spyOn(api, 'addTaskComment');
      await queue.enqueueComment(comment(' On my way ', true));

      const [outcome] = await queue.replay(api);

      expect(add).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ kind: 'already', comment: posted });
      expect(queue.items).toEqual([]);
    });

    it('checks the last page of a long thread', async () => {
      const list = vi.spyOn(api, 'listTaskComments').mockResolvedValueOnce({
        content: [],
        totalPages: 3,
      });
      await queue.enqueueComment(comment('On my way', true));

      await queue.replay(api);

      expect(list.mock.calls.map((c) => c[2])).toEqual([
        { page: 0, size: 100 },
        { page: 2, size: 100 },
      ]);
    });

    it('posts an attempted comment whose match is older than it', async () => {
      await api.addTaskComment('p1', '1', { body: 'On my way' });
      const later = new WriteQueue(store, {
        now: () => Date.now() + POSTED_CLOCK_SKEW_MS + 60_000,
      });
      await later.load('a1');
      const add = vi.spyOn(api, 'addTaskComment');
      await later.enqueueComment(comment('On my way', true));

      const [outcome] = await later.replay(api);

      expect(add).toHaveBeenCalledTimes(1);
      expect(outcome.kind).toBe('sent');
    });

    it('posts an attempted comment matched only by someone else’s', async () => {
      vi.spyOn(api, 'listTaskComments').mockResolvedValue({
        content: [
          {
            id: 'x',
            authorId: 'a2',
            body: 'On my way',
            createdAt: new Date().toISOString(),
          },
        ],
        totalPages: 1,
      });
      const add = vi.spyOn(api, 'addTaskComment');
      await queue.enqueueComment(comment('On my way', true));

      await queue.replay(api);

      expect(add).toHaveBeenCalledTimes(1);
    });

    it('reports a posted comment before its item leaves the list', async () => {
      const seen: number[] = [];
      queue.onCommentSent((item, posted) => {
        seen.push(queue.items.length);
        expect(item.body).toBe('On my way');
        expect(posted.id).toBeTruthy();
      });
      await queue.enqueueComment(comment());

      await queue.replay(api);

      expect(seen).toEqual([1]);
      expect(queue.items).toEqual([]);
    });

    it('joins a replay already running', async () => {
      await queue.enqueueStatus(change(TODO));
      const send = vi.spyOn(api, 'changeTaskStatus');

      await Promise.all([queue.replay(api), queue.replay(api)]);

      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('dropUnsent', () => {
    it('keeps a failed comment', async () => {
      vi.spyOn(api, 'addTaskComment').mockRejectedValueOnce(
        new ApiError(404, { message: 'Gone' })
      );
      await queue.enqueueComment(comment());
      await queue.replay(api);

      await queue.dropUnsent('1');

      expect(queue.items.map((i) => `${i.kind} ${i.state}`)).toEqual([
        'comment failed',
      ]);
    });

    it('forgets a task’s conflict and failure, and keeps the rest', async () => {
      await closeOnServer();
      await queue.enqueueStatus(change(TODO));
      await queue.replay(api);
      await queue.enqueueStatus(change(DONE, TODO, '2'));
      expect(queue.items.map((i) => `${i.taskId} ${i.state}`)).toEqual([
        '1 conflict',
        '2 queued',
      ]);

      await queue.dropUnsent('1');
      await queue.dropUnsent('2');

      expect(queue.items.map((i) => `${i.taskId} ${i.state}`)).toEqual([
        '2 queued',
      ]);
      expect(queue.pending('1')).toBeUndefined();
      const again = new WriteQueue(store);
      await again.load('a1');
      expect(again.items).toHaveLength(1);
    });
  });
});
