import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Account } from '@core/api';
import { MemoryCacheStore, type StatusChangeRequest } from '@core/offline';
import { AuthService } from '../auth/auth.service';
import { WRITE_QUEUE_STORE } from '../providers/write-queue-store.token';
import { WriteQueueService } from './write-queue.service';

const TO_TODO: StatusChangeRequest = {
  projectId: 'p1',
  taskId: '1',
  taskKey: 'CHK-142',
  from: { slug: 'in_progress' },
  to: { slug: 'todo', name: 'To Do' },
};

describe('WriteQueueService', () => {
  let account: ReturnType<typeof signal<Account | null>>;
  let service: WriteQueueService;

  beforeEach(() => {
    account = signal<Account | null>({ id: 'a1' });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { account, restore: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: WRITE_QUEUE_STORE, useValue: new MemoryCacheStore() },
      ],
    });
    service = TestBed.inject(WriteQueueService);
  });

  /** Lets `init`'s restore-then-watch chain and its effect run. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }

  it('queues for the signed-in account, and shows it', async () => {
    service.init();
    await settle();

    expect(await service.enqueueStatus(TO_TODO)).toBe(true);

    expect(service.items()).toHaveLength(1);
    expect(service.pendingTaskIds().has('1')).toBe(true);
    expect(service.queuedStatuses().get('1')).toBe('todo');
    expect(service.pending('1')?.state).toBe('queued');
  });

  it('keeps the changes through a sign-out, for that account', async () => {
    service.init();
    await settle();
    await service.enqueueStatus(TO_TODO);

    account.set(null);
    await settle();
    expect(service.items()).toEqual([]);

    account.set({ id: 'a1' });
    await settle();
    expect(service.items()).toHaveLength(1);
  });

  it('queues nothing before an account is loaded', async () => {
    expect(await service.enqueueStatus(TO_TODO)).toBe(false);
  });

  it('only signals queued statuses when one changes', async () => {
    service.init();
    await settle();
    await service.enqueueStatus(TO_TODO);
    const before = service.queuedStatuses();

    // Marking it sending changes the list, not the status reads show.
    await service.queue.replay({
      getTask: () => {
        expect(service.items()[0].state).toBe('sending');
        expect(service.queuedStatuses()).toBe(before);
        return Promise.reject(new Error('stop'));
      },
      changeTaskStatus: vi.fn(),
    });

    expect(service.queuedStatuses()).toBe(before);
  });
});
