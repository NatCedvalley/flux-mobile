import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import type { Task, WorkflowStatus } from '@core/api';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { ConnectivityService } from '../offline/connectivity.service';
import { WriteQueueService } from '../offline/write-queue.service';
import { FLUX_API } from '../providers/flux-api.token';
import { TaskChangesService } from './task-changes.service';
import { TaskStatusService } from './task-status.service';
import { UndoToastService } from './undo-toast.service';

const TODO: WorkflowStatus = { slug: 'todo', name: 'To Do', category: 'TODO' };
const DONE: WorkflowStatus = {
  slug: 'done',
  name: 'Done',
  category: 'DONE',
  isClosed: true,
};

describe('TaskStatusService', () => {
  let api: InMemoryFluxApi;
  let online: ReturnType<typeof signal<boolean>>;
  let toasts: { create: ReturnType<typeof vi.fn> };
  let undo: {
    offer: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };
  let writeQueue: WriteQueueService;
  let changes: TaskChangesService;
  let service: TaskStatusService;
  let task: Task;
  let shown: Task | undefined;
  const view = { apply: (t: Task) => (shown = t) };

  beforeEach(async () => {
    api = new InMemoryFluxApi();
    online = signal(true);
    toasts = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    undo = { offer: vi.fn().mockResolvedValue(undefined), dismiss: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: FLUX_API, useValue: api },
        { provide: ConnectivityService, useValue: { online } },
        { provide: ToastController, useValue: toasts },
        { provide: UndoToastService, useValue: undo },
      ],
    });
    writeQueue = TestBed.inject(WriteQueueService);
    changes = TestBed.inject(TaskChangesService);
    service = TestBed.inject(TaskStatusService);
    await writeQueue.queue.load('a1');
    task = await api.getTask('p1', '1'); // CHK-142, in progress
    shown = undefined;
  });

  /** Runs the Undo the last toast offered. */
  function tapUndo(): Promise<unknown> {
    const [, , run] = undo.offer.mock.lastCall as [
      string,
      unknown,
      () => Promise<unknown>,
    ];
    return run();
  }

  it('sends a change online, and offers Undo', async () => {
    expect(await service.move(task, TODO, undefined, view)).toBe('sent');

    expect((await api.getTask('p1', '1')).status).toBe('todo');
    expect(shown?.status).toBe('todo');
    expect(writeQueue.items()).toEqual([]);
    expect(undo.offer).toHaveBeenCalledWith(
      'Moved to To Do',
      undefined,
      expect.any(Function)
    );
  });

  it('queues a change offline without trying the server', async () => {
    online.set(false);
    const send = vi.spyOn(api, 'changeTaskStatus');

    expect(await service.move(task, DONE, 'done', view)).toBe('queued');

    expect(send).not.toHaveBeenCalled();
    expect(shown).toMatchObject({ status: 'done', resolution: 'done' });
    expect(changes.changed()?.task.status).toBe('done');
    expect(writeQueue.items()[0]).toMatchObject({
      taskId: '1',
      taskKey: 'CHK-142',
      from: { slug: 'in_progress' },
      to: { slug: 'done', name: 'Done', isClosed: true, resolution: 'done' },
      state: 'queued',
    });
    expect(undo.offer).toHaveBeenCalled();
  });

  it('queues a change that gets no response', async () => {
    vi.spyOn(api, 'changeTaskStatus').mockRejectedValue(new ApiError(0));

    expect(await service.move(task, TODO, undefined, view)).toBe('queued');

    expect(shown?.status).toBe('todo');
    expect(writeQueue.items()).toHaveLength(1);
    expect(toasts.create).not.toHaveBeenCalled();
  });

  it('queues a change to a task with one still queued, even online', async () => {
    online.set(false);
    await service.move(task, TODO, undefined, view);
    online.set(true);
    const send = vi.spyOn(api, 'changeTaskStatus');

    expect(await service.move(shown!, DONE, 'done', view, false)).toBe(
      'queued'
    );

    expect(send).not.toHaveBeenCalled();
    expect(writeQueue.items()).toHaveLength(1);
    expect(writeQueue.items()[0].to.slug).toBe('done');
  });

  it('cancels a queued change with Undo', async () => {
    online.set(false);
    await service.move(task, TODO, undefined, view);

    await tapUndo();

    expect(shown?.status).toBe('in_progress');
    expect(writeQueue.items()).toEqual([]);
  });

  it('still puts back a change the server refuses', async () => {
    vi.spyOn(api, 'changeTaskStatus').mockRejectedValue(
      new ApiError(400, { message: 'Nope' })
    );

    expect(await service.move(task, TODO, undefined, view)).toBe('refused');

    expect(shown).toBe(task);
    expect(writeQueue.items()).toEqual([]);
    expect(toasts.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Nope' })
    );
  });

  it('puts the change back when there is no account to queue it for', async () => {
    await writeQueue.queue.load(undefined);
    online.set(false);

    expect(await service.move(task, TODO, undefined, view)).toBe('refused');

    expect(shown).toBe(task);
    expect(toasts.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Couldn’t change the status' })
    );
  });

  it('says archiving needs a connection when offline', async () => {
    online.set(false);
    const archive = vi.spyOn(api, 'archiveTask');
    const removed = vi.fn();

    expect(await service.archive(task, { removed, restored: vi.fn() })).toBe(
      false
    );

    expect(archive).not.toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();
    expect(toasts.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Archiving needs a connection.' })
    );
  });

  it('forgets the task’s old conflict once a change is sent online', async () => {
    online.set(false);
    await service.move(task, TODO, undefined, view);
    await api.changeTaskStatus('p1', '1', {
      status: 'done',
      resolution: 'done',
    });
    await writeQueue.queue.replay(api);
    expect(writeQueue.pending('1')?.state).toBe('conflict');
    online.set(true);

    const fresh = await api.getTask('p1', '1');
    expect(await service.move(fresh, TODO, undefined, view)).toBe('sent');

    expect(writeQueue.items()).toEqual([]);
    expect(writeQueue.pendingTaskIds().has('1')).toBe(false);
  });
});
