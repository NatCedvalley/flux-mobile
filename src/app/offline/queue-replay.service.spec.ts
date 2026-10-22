import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from '@capacitor/app';
import { ToastController } from '@ionic/angular';
import type { Account } from '@core/api';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import {
  MemoryCacheStore,
  type CommentRequest,
  type StatusChangeRequest,
} from '@core/offline';
import { AuthService } from '../auth/auth.service';
import { FLUX_API } from '../providers/flux-api.token';
import { NETWORK_FLUX_API } from '../providers/network-flux-api.token';
import { WRITE_QUEUE_STORE } from '../providers/write-queue-store.token';
import { TaskChangesService } from '../task-status/task-changes.service';
import { ConnectivityService } from './connectivity.service';
import { QueueReplayService } from './queue-replay.service';
import { WriteQueueService } from './write-queue.service';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

/** CHK-142 (in progress in the in-memory backend) moved to To Do. */
const TO_TODO: StatusChangeRequest = {
  projectId: 'p1',
  taskId: '1',
  taskKey: 'CHK-142',
  from: { slug: 'in_progress' },
  to: { slug: 'todo', name: 'To Do', category: 'TODO' },
};

/** A comment on CHK-142. */
const COMMENT: CommentRequest = {
  projectId: 'p1',
  taskId: '1',
  taskKey: 'CHK-142',
  body: 'On my way',
  mentionedAccountIds: [],
};

describe('QueueReplayService', () => {
  let api: InMemoryFluxApi;
  let account: ReturnType<typeof signal<Account | null>>;
  let online: ReturnType<typeof signal<boolean>>;
  let listeners: Record<string, () => void>;
  let toasts: { create: ReturnType<typeof vi.fn> };
  let writeQueue: WriteQueueService;
  let changes: TaskChangesService;
  let service: QueueReplayService;

  beforeEach(async () => {
    vi.clearAllMocks();
    listeners = {};
    vi.mocked(App.addListener).mockImplementation(((
      event: string,
      listener: () => void
    ) => {
      listeners[event] = listener;
      return Promise.resolve({ remove: vi.fn() });
    }) as never);
    api = new InMemoryFluxApi();
    account = signal<Account | null>({ id: 'a1' });
    online = signal(false);
    toasts = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() }),
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { account, restore: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: ConnectivityService, useValue: { online } },
        { provide: FLUX_API, useValue: api },
        { provide: NETWORK_FLUX_API, useValue: api },
        { provide: WRITE_QUEUE_STORE, useValue: new MemoryCacheStore() },
        { provide: ToastController, useValue: toasts },
      ],
    });
    writeQueue = TestBed.inject(WriteQueueService);
    changes = TestBed.inject(TaskChangesService);
    service = TestBed.inject(QueueReplayService);
    await writeQueue.queue.load('a1');
    await writeQueue.enqueueStatus(TO_TODO);
  });

  /** Lets `init`'s restore-then-watch chain, its effect and the replay run. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      TestBed.tick();
    }
  }

  it('sends nothing while offline', async () => {
    const send = vi.spyOn(api, 'changeTaskStatus');
    service.init();
    await settle();

    expect(send).not.toHaveBeenCalled();
    expect(writeQueue.items()).toHaveLength(1);
  });

  it('sends the queue when the connection comes back, and reports the task', async () => {
    service.init();
    await settle();

    online.set(true);
    await settle();

    expect((await api.getTask('p1', '1')).status).toBe('todo');
    expect(writeQueue.items()).toEqual([]);
    expect(changes.changed()?.task).toMatchObject({ id: '1', status: 'todo' });
    expect(toasts.create).not.toHaveBeenCalled();
  });

  it('sends at launch, and on sign-in', async () => {
    online.set(true);
    account.set(null);
    service.init();
    await settle();
    expect(writeQueue.items()).toHaveLength(1);

    account.set({ id: 'a1' });
    await settle();

    expect(writeQueue.items()).toEqual([]);
  });

  it('sends on resume', async () => {
    online.set(true);
    // The launch replay can't reach the server.
    vi.spyOn(api, 'getTask').mockRejectedValueOnce(new ApiError(0));
    service.init();
    await settle();
    expect(writeQueue.items()[0].state).toBe('queued');

    listeners['resume']();
    await settle();

    expect(writeQueue.items()).toEqual([]);
  });

  it('puts the server’s copy back and says so for a conflict', async () => {
    await api.changeTaskStatus('p1', '1', {
      status: 'done',
      resolution: 'done',
    });
    online.set(true);

    await service.replay();

    expect(changes.changed()?.task.status).toBe('done');
    expect(writeQueue.items()[0].state).toBe('conflict');
    expect(toasts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'CHK-142 changed on the server, so your status change wasn’t sent.',
      })
    );
  });

  it('puts the server’s copy back and says what it refused', async () => {
    vi.spyOn(api, 'changeTaskStatus').mockRejectedValue(
      new ApiError(400, { message: 'Not for this type' })
    );
    online.set(true);

    await service.replay();

    expect(changes.changed()?.task.status).toBe('in_progress');
    expect(writeQueue.items()[0].state).toBe('failed');
    expect(toasts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Couldn’t move CHK-142: Not for this type',
      })
    );
  });

  it('takes out a task that is gone', async () => {
    vi.spyOn(api, 'getTask').mockRejectedValue(new ApiError(404));
    online.set(true);

    await service.replay();

    expect(changes.changed()).toEqual({
      task: { id: '1', projectId: 'p1', taskKey: 'CHK-142' },
      removed: true,
    });
  });

  it('refreshes a task whose change was given up, from the cache offline', async () => {
    const [item] = writeQueue.items();

    await service.refreshTask(item);

    expect(changes.changed()).toEqual({
      task: expect.objectContaining({ id: '1', status: 'in_progress' }),
      removed: false,
    });
  });

  it('counts several refusals in one toast', async () => {
    await writeQueue.enqueueStatus({
      ...TO_TODO,
      taskId: '2',
      taskKey: 'CHK-138',
    });
    vi.spyOn(api, 'getTask').mockResolvedValue({ status: 'in_progress' });
    vi.spyOn(api, 'changeTaskStatus').mockRejectedValue(new ApiError(422));
    online.set(true);

    await service.replay();

    expect(toasts.create).toHaveBeenCalledTimes(1);
    expect(toasts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '2 status changes couldn’t be sent.',
      })
    );
  });

  it('fetches My Work’s lists again once something settled', async () => {
    const list = vi.spyOn(api, 'listMyTasks');
    online.set(true);

    await service.replay();
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(3));

    expect(list.mock.calls.map(([q]) => q?.scope)).toEqual([
      'assigned',
      'assigned',
      'watching',
    ]);
  });

  describe('comments', () => {
    beforeEach(async () => {
      // Comments only: the status change is cancelled, as Undo does.
      await writeQueue.enqueueStatus({
        ...TO_TODO,
        from: TO_TODO.to,
        to: TO_TODO.from,
      });
      await writeQueue.enqueueComment(COMMENT);
    });

    it('posts a comment and fetches neither the task nor My Work', async () => {
      const getTask = vi.spyOn(api, 'getTask');
      const list = vi.spyOn(api, 'listMyTasks');
      online.set(true);

      await service.replay();
      await new Promise((resolve) => setTimeout(resolve));

      expect(writeQueue.items()).toEqual([]);
      expect(writeQueue.sentComment()?.comment.body).toBe('On my way');
      expect(getTask).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
      expect(changes.changed()).toBeUndefined();
      expect(toasts.create).not.toHaveBeenCalled();
    });

    it('keeps a refused comment and says why', async () => {
      vi.spyOn(api, 'addTaskComment').mockRejectedValue(
        new ApiError(403, { message: 'Insufficient project role' })
      );
      online.set(true);

      await service.replay();

      expect(writeQueue.items()[0].state).toBe('failed');
      expect(toasts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'Couldn’t post your comment on CHK-142: Insufficient project role',
        })
      );
    });

    it('counts several refused comments in one toast', async () => {
      await writeQueue.enqueueComment({ ...COMMENT, body: 'Again' });
      vi.spyOn(api, 'addTaskComment').mockRejectedValue(new ApiError(404));
      online.set(true);

      await service.replay();

      expect(toasts.create).toHaveBeenCalledTimes(1);
      expect(toasts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '2 comments couldn’t be posted.',
        })
      );
    });
  });

  it('fetches nothing more when nothing settled', async () => {
    // Back where it started, as Undo does: the queue is empty.
    await writeQueue.enqueueStatus({
      ...TO_TODO,
      from: TO_TODO.to,
      to: TO_TODO.from,
    });
    expect(writeQueue.items()).toEqual([]);
    const list = vi.spyOn(api, 'listMyTasks');
    online.set(true);

    await service.replay();
    await new Promise((resolve) => setTimeout(resolve));

    expect(list).not.toHaveBeenCalled();
  });
});
