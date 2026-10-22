import { ApiError } from '../auth/api-error';
import { InMemoryFluxApi } from '../mock/in-memory-flux-api';
import { MemoryCacheStore } from './cache-store';
import {
  WriteQueue,
  type QueuedStatus,
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
      expect(queue.items[0].from.slug).toBe('in_progress');
      expect(queue.items[0].to).toEqual(DONE);
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

      expect(queue.items[0].to.resolution).toBe('wont-do');
    });

    it('drops the resolution of an open status', async () => {
      await queue.enqueueStatus(change({ ...TODO, resolution: 'done' }));

      expect(queue.items[0].to.resolution).toBeUndefined();
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

    it('joins a replay already running', async () => {
      await queue.enqueueStatus(change(TODO));
      const send = vi.spyOn(api, 'changeTaskStatus');

      await Promise.all([queue.replay(api), queue.replay(api)]);

      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('dropUnsent', () => {
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
