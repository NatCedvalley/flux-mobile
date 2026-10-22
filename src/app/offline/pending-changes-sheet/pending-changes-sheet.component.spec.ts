import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { MemoryCacheStore, type ReplayApi } from '@core/offline';
import { FLUX_API } from '../../providers/flux-api.token';
import { WRITE_QUEUE_STORE } from '../../providers/write-queue-store.token';
import { QueueReplayService } from '../queue-replay.service';
import { WriteQueueService } from '../write-queue.service';
import { PendingChangesSheetComponent } from './pending-changes-sheet.component';

const clipboard = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: clipboard }));

describe('PendingChangesSheetComponent', () => {
  let store: MemoryCacheStore;
  let writeQueue: WriteQueueService;
  let replay: {
    replay: ReturnType<typeof vi.fn>;
    refreshTask: ReturnType<typeof vi.fn>;
  };
  let alert: { role: string; create: ReturnType<typeof vi.fn> };
  let toasts: { create: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<PendingChangesSheetComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    vi.clearAllMocks();
    store = new MemoryCacheStore();
    replay = {
      replay: vi.fn().mockResolvedValue(undefined),
      refreshTask: vi.fn().mockResolvedValue(undefined),
    };
    alert = {
      role: 'destructive',
      create: vi.fn(() =>
        Promise.resolve({
          present: vi.fn(),
          onDidDismiss: () => Promise.resolve({ role: alert.role }),
        })
      ),
    };
    toasts = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    TestBed.configureTestingModule({
      imports: [PendingChangesSheetComponent],
      providers: [
        { provide: FLUX_API, useValue: new InMemoryFluxApi() },
        { provide: WRITE_QUEUE_STORE, useValue: store },
        { provide: QueueReplayService, useValue: replay },
        { provide: AlertController, useValue: alert },
        { provide: ToastController, useValue: toasts },
      ],
    });
    writeQueue = TestBed.inject(WriteQueueService);
    await writeQueue.queue.load('a1');
  });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(PendingChangesSheetComponent);
    el = fixture.nativeElement as HTMLElement;
    await update();
  }

  async function update(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function queueStatus(taskId = '1', taskKey = 'CHK-142'): Promise<boolean> {
    return writeQueue.enqueueStatus({
      projectId: 'p1',
      taskId,
      taskKey,
      from: { slug: 'in_progress' },
      to: { slug: 'todo', name: 'To Do' },
    });
  }

  function queueComment(body = 'On my way'): Promise<boolean> {
    return writeQueue.enqueueComment({
      projectId: 'p1',
      taskId: '1',
      taskKey: 'CHK-142',
      body,
      mentionedAccountIds: [],
    });
  }

  /** A server where every task is done and every comment refused. */
  const server: ReplayApi = {
    getTask: (_p, id) =>
      Promise.resolve({
        id,
        status: 'done',
        statusCategory: 'DONE',
        isClosedStatus: true,
        resolution: 'done',
      }),
    changeTaskStatus: vi.fn(),
    listTaskComments: vi.fn(),
    addTaskComment: () =>
      Promise.reject(new ApiError(422, { message: 'Task is archived' })),
  };

  const rows = () => [...el.querySelectorAll('.item')];
  const text = (row: Element, selector: string) =>
    row.querySelector(selector)?.textContent?.trim();
  const buttons = (row: Element) =>
    [...row.querySelectorAll('ion-button')].map((b) => b.textContent?.trim());
  const press = (row: Element, label: string) =>
    [...row.querySelectorAll<HTMLElement>('ion-button')]
      .find((b) => b.textContent?.trim() === label)
      ?.click();

  it('lists each item with its key, change, state and age', async () => {
    await queueStatus();
    await queueComment('Pushed the fix');
    await render();

    expect(text(el, '.subtitle')).toBe('2 changes');
    const [status, comment] = rows();
    expect(text(status, '.key')).toBe('CHK-142');
    expect(text(status, '.change')).toBe('Move to To Do');
    expect(text(status, '.state')).toBe('Waiting');
    expect(text(status, '.age')).toBe('now');
    expect(buttons(status)).toEqual(['Discard']);
    expect(text(comment, '.change')).toBe('Comment: “Pushed the fix”');
  });

  it('names the server’s status for a conflict, with both choices', async () => {
    await queueStatus();
    await writeQueue.queue.replay(server);
    await render();

    const [row] = rows();
    expect(text(row, '.state')).toBe('CHK-142 is now Done');
    expect(buttons(row)).toEqual(['Apply mine', 'Keep theirs']);
    expect(text(el, '.subtitle')).toBe('1 change · 1 needs attention');
  });

  it('applies mine, then sends it', async () => {
    await queueStatus();
    await writeQueue.queue.replay(server);
    await render();

    press(rows()[0], 'Apply mine');
    await update();

    expect(writeQueue.items()[0]).toMatchObject({
      state: 'queued',
      from: { slug: 'done' },
    });
    expect(replay.replay).toHaveBeenCalled();
  });

  it('keeps theirs: drops the change, refreshes the task and closes', async () => {
    await queueStatus();
    await writeQueue.queue.replay(server);
    const [item] = writeQueue.items();
    await render();
    const done = vi.fn();
    fixture.componentInstance.done.subscribe(done);

    press(rows()[0], 'Keep theirs');
    await update();

    expect(writeQueue.items()).toEqual([]);
    expect(replay.refreshTask).toHaveBeenCalledWith(item);
    expect(done).toHaveBeenCalled();
  });

  it('offers only Keep theirs for a conflict saved without the server’s status', async () => {
    await queueStatus();
    await writeQueue.queue.replay(server);
    await writeQueue.queue.load(undefined);
    const blob = JSON.parse((await store.read('write-queue.a1.json')) ?? '{}');
    delete blob.items[0].current;
    await store.write('write-queue.a1.json', JSON.stringify(blob));
    await writeQueue.queue.load('a1');
    await render();

    const [row] = rows();
    expect(text(row, '.state')).toBe('CHK-142 changed on the server');
    expect(buttons(row)).toEqual(['Keep theirs']);
  });

  it('discards a queued status change at once and refreshes the task', async () => {
    await queueStatus();
    await queueStatus('2', 'CHK-143');
    await render();

    press(rows()[0], 'Discard');
    await update();

    expect(alert.create).not.toHaveBeenCalled();
    expect(writeQueue.items().map((i) => i.taskKey)).toEqual(['CHK-143']);
    expect(replay.refreshTask).toHaveBeenCalled();
  });

  it('asks before discarding a comment', async () => {
    await queueComment();
    await render();
    alert.role = 'cancel';

    press(rows()[0], 'Discard');
    await update();
    expect(alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Your comment on CHK-142 was never posted, so its text will be lost.',
      })
    );
    expect(writeQueue.items()).toHaveLength(1);

    alert.role = 'destructive';
    press(rows()[0], 'Discard');
    await update();
    expect(writeQueue.items()).toEqual([]);
  });

  it('shows a refused comment’s message, with Retry and Copy text', async () => {
    await queueComment('Pushed the fix');
    await writeQueue.queue.replay(server);
    clipboard.write.mockResolvedValue(undefined);
    await render();

    const [row] = rows();
    expect(text(row, '.state')).toBe('Not posted · Task is archived');
    expect(buttons(row)).toEqual(['Retry', 'Copy text', 'Discard']);

    press(row, 'Copy text');
    await update();
    expect(clipboard.write).toHaveBeenCalledWith({ string: 'Pushed the fix' });
    expect(toasts.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Copied the comment' })
    );

    press(row, 'Retry');
    await update();
    expect(writeQueue.items()[0].state).toBe('queued');
    expect(replay.replay).toHaveBeenCalled();
  });

  it('offers nothing for an item being sent', async () => {
    await queueStatus();
    let shown: string[] = [];
    await writeQueue.queue.replay({
      ...server,
      getTask: async () => {
        await render();
        shown = rows().map((r) => `${text(r, '.state')} ${buttons(r).length}`);
        throw new ApiError(0);
      },
    });

    expect(shown).toEqual(['Sending 0']);
  });
});
