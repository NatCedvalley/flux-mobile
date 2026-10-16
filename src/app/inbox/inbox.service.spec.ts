import type { Mock } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from '@capacitor/app';
import type { Account, FluxApi } from '@core/api';
import { AuthService } from '../auth/auth.service';
import { FLUX_API } from '../providers/flux-api.token';
import { InboxService } from './inbox.service';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

describe('InboxService', () => {
  let service: InboxService;
  let account: ReturnType<typeof signal<Account | null>>;
  let count: Mock<FluxApi['notificationUnreadCount']>;
  let listeners: Record<string, () => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    listeners = {};
    vi.mocked(App.addListener).mockImplementation(((
      event: string,
      listener: () => void
    ) => {
      listeners[event] = listener;
      return Promise.resolve({ remove: vi.fn() });
    }) as never);
    account = signal<Account | null>({ id: 'a1' });
    count = vi
      .fn<FluxApi['notificationUnreadCount']>()
      .mockImplementation((type) =>
        Promise.resolve({ unreadCount: type ? 1 : 4 })
      );
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { account, restore: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: FLUX_API, useValue: { notificationUnreadCount: count } },
      ],
    });
    service = TestBed.inject(InboxService);
  });

  /** Lets `init`'s restore-then-watch chain, its effect and the fetches run. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }

  it('loads both counts once signed in', async () => {
    expect(service.unread()).toBeUndefined();

    service.init();
    await settle();

    expect(count.mock.calls).toEqual([[], ['MENTION,DESCRIPTION_MENTION']]);
    expect(service.unread()).toBe(4);
    expect(service.mentions()).toBe(1);
  });

  it('clears the counts on sign-out, and loads them for the next account', async () => {
    service.init();
    await settle();

    account.set(null);
    await settle();
    expect(service.unread()).toBeUndefined();
    expect(service.mentions()).toBeUndefined();

    count.mockResolvedValue({ unreadCount: 7 });
    account.set({ id: 'a2' });
    await settle();
    expect(service.unread()).toBe(7);
  });

  it('refreshes on resume while signed in only', async () => {
    service.init();
    await settle();
    count.mockClear();

    listeners['resume']();
    await settle();
    expect(count).toHaveBeenCalledTimes(2);

    account.set(null);
    await settle();
    count.mockClear();
    listeners['resume']();
    await settle();
    expect(count).not.toHaveBeenCalled();
  });

  it('keeps a count that fails to load', async () => {
    service.init();
    await settle();

    count.mockImplementation((type) =>
      type
        ? Promise.resolve({ unreadCount: 0 })
        : Promise.reject(new Error('offline'))
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await service.refresh();

    expect(service.unread()).toBe(4);
    expect(service.mentions()).toBe(0);
  });

  it('moves the counts for one notification, mentions only for mentions', async () => {
    await service.refresh();

    service.adjust({ type: 'ASSIGNMENT' }, -1);
    expect([service.unread(), service.mentions()]).toEqual([3, 1]);

    service.adjust({ type: 'MENTION' }, -1);
    expect([service.unread(), service.mentions()]).toEqual([2, 0]);

    service.adjust({ type: 'MENTION' }, +1);
    expect([service.unread(), service.mentions()]).toEqual([3, 1]);
  });

  it('clears both counts for Mark all read, and puts them back', async () => {
    await service.refresh();

    const restore = service.clearUnread();
    expect([service.unread(), service.mentions()]).toEqual([0, 0]);

    restore();
    expect([service.unread(), service.mentions()]).toEqual([4, 1]);
  });
});
