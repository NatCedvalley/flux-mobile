import type { Mock } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { NavController, ToastController } from '@ionic/angular';
import type { FluxApi } from '@core/api';
import { ApiError } from '@core/auth';
import { AuthService } from '../auth/auth.service';
import { InboxService } from '../inbox/inbox.service';
import { AppLockService } from '../lock/app-lock.service';
import { FLUX_API } from '../providers/flux-api.token';
import { PushOpenService } from './push-open.service';
import { PushService } from './push.service';

vi.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: { addListener: vi.fn() },
}));

/** A comment push as flux-operations sends it. */
const COMMENT = {
  notificationId: 'n1',
  type: 'COMMENT',
  entityType: 'TASK',
  entityId: 't1',
  projectId: 'p1',
};

describe('PushOpenService', () => {
  let listeners: Record<string, (event: unknown) => void>;
  let available: boolean;
  let signedIn: ReturnType<typeof signal<boolean>>;
  let locked: ReturnType<typeof signal<boolean>>;
  let restored: () => void;
  let markRead: Mock<FluxApi['markNotificationRead']>;
  let inbox: { refresh: Mock; listsChanged: Mock };
  let nav: { navigateBack: Mock; navigateForward: Mock };
  let toast: { create: Mock };
  let toasts: { present: Mock; dismiss: Mock }[];

  beforeEach(() => {
    vi.clearAllMocks();
    listeners = {};
    vi.mocked(FirebaseMessaging.addListener).mockImplementation(((
      event: string,
      listener: (event: unknown) => void
    ) => {
      listeners[event] = listener;
      return Promise.resolve({ remove: vi.fn() });
    }) as never);
    available = true;
    signedIn = signal(true);
    locked = signal(false);
    const restore = new Promise<void>((resolve) => (restored = resolve));
    markRead = vi.fn<FluxApi['markNotificationRead']>().mockResolvedValue({});
    inbox = {
      refresh: vi.fn().mockResolvedValue(undefined),
      listsChanged: vi.fn(),
    };
    nav = {
      navigateBack: vi.fn().mockResolvedValue(true),
      navigateForward: vi.fn().mockResolvedValue(true),
    };
    toasts = [];
    toast = {
      create: vi.fn(() => {
        const t = {
          present: vi.fn().mockResolvedValue(undefined),
          dismiss: vi.fn().mockResolvedValue(true),
        };
        toasts.push(t);
        return Promise.resolve(t);
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { isSignedIn: signedIn, restore: () => restore },
        },
        { provide: AppLockService, useValue: { locked } },
        { provide: InboxService, useValue: inbox },
        { provide: PushService, useValue: { available } },
        { provide: FLUX_API, useValue: { markNotificationRead: markRead } },
        { provide: NavController, useValue: nav },
        { provide: ToastController, useValue: toast },
      ],
    });
  });

  function init(): void {
    TestBed.overrideProvider(PushService, { useValue: { available } });
    TestBed.inject(PushOpenService).init();
  }

  /** Lets the restore chain, the effect and the writes run. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }

  const tap = (data: unknown) =>
    listeners['notificationActionPerformed']({
      actionId: 'tap',
      notification: { data },
    });

  const opened = () => [
    ...nav.navigateBack.mock.calls.map(([url]) => url),
    ...nav.navigateForward.mock.calls.map(([commands]) => commands),
  ];

  it('stays off where push is not available', () => {
    available = false;
    init();

    expect(FirebaseMessaging.addListener).not.toHaveBeenCalled();
  });

  it('opens a cold start tap on the Inbox stack once the session is restored', async () => {
    init();
    tap(COMMENT);
    await settle();
    expect(nav.navigateBack).not.toHaveBeenCalled();

    restored();
    await settle();

    expect(nav.navigateBack).toHaveBeenCalledWith('/tabs/inbox', {
      animated: false,
    });
    expect(nav.navigateForward).toHaveBeenCalledWith([
      '/tabs/inbox/tasks',
      'p1',
      't1',
    ]);
    expect(markRead).toHaveBeenCalledWith('n1');
    expect(inbox.refresh).toHaveBeenCalled();
    expect(inbox.listsChanged).toHaveBeenCalled();
  });

  it('waits for the lock to be passed', async () => {
    locked.set(true);
    init();
    restored();
    tap(COMMENT);
    await settle();
    expect(opened()).toEqual([]);
    expect(markRead).not.toHaveBeenCalled();

    locked.set(false);
    await settle();
    expect(opened()).toEqual([
      '/tabs/inbox',
      ['/tabs/inbox/tasks', 'p1', 't1'],
    ]);
  });

  it('opens nothing for a tap while signed out, then or after a sign-in', async () => {
    signedIn.set(false);
    init();
    restored();
    tap(COMMENT);
    await settle();

    signedIn.set(true);
    await settle();

    expect(opened()).toEqual([]);
    expect(markRead).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a release',
      {
        notificationId: 'n1',
        type: 'RELEASE_CREATED',
        entityType: 'RELEASE',
        entityId: 'r1',
        projectId: 'p1',
      },
    ],
    ['a deleted task', { notificationId: 'n1', type: 'TASK_DELETED' }],
    ['a task push without its project', { ...COMMENT, projectId: undefined }],
  ])('opens the Inbox for %s and marks it read', async (_, data) => {
    init();
    restored();
    tap(data);
    await settle();

    expect(opened()).toEqual(['/tabs/inbox']);
    expect(markRead).toHaveBeenCalledWith('n1');
  });

  it('opens the Inbox for data it could not read, with nothing to mark', async () => {
    init();
    restored();
    tap({ foo: 'bar' });
    await settle();

    expect(opened()).toEqual(['/tabs/inbox']);
    expect(markRead).not.toHaveBeenCalled();
  });

  it('ignores a notification the server no longer has', async () => {
    markRead.mockRejectedValue(
      new ApiError(404, { code: 'NOTIFICATION_NOT_FOUND' })
    );
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    init();
    restored();
    tap(COMMENT);
    await settle();

    expect(opened()).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    expect(inbox.listsChanged).not.toHaveBeenCalled();
  });

  describe('in the foreground', () => {
    const receive = (data: unknown = COMMENT) =>
      listeners['notificationReceived']({
        notification: {
          title: 'Ben Tan commented',
          body: 'CHK-142: Fix 3DS redirect',
          data,
        },
      });

    it('refreshes the Inbox and shows a toast at the top with Open', async () => {
      init();
      restored();
      receive();
      await settle();

      expect(inbox.refresh).toHaveBeenCalled();
      expect(inbox.listsChanged).toHaveBeenCalled();
      const [options] = toast.create.mock.calls[0];
      expect(options).toMatchObject({
        header: 'Ben Tan commented',
        message: 'CHK-142: Fix 3DS redirect',
        position: 'top',
      });
      expect(options.positionAnchor).toBeUndefined();
      expect(toasts[0].present).toHaveBeenCalled();
      expect(opened()).toEqual([]);

      options.buttons[0].handler();
      await settle();
      expect(options.buttons[0].text).toBe('Open');
      expect(opened()).toEqual([
        '/tabs/inbox',
        ['/tabs/inbox/tasks', 'p1', 't1'],
      ]);
      expect(markRead).toHaveBeenCalledWith('n1');
    });

    it('replaces the toast of an earlier push', async () => {
      init();
      restored();
      receive();
      await settle();
      receive();
      await settle();

      expect(toasts).toHaveLength(2);
      expect(toasts[0].dismiss).toHaveBeenCalled();
      expect(toasts[1].dismiss).not.toHaveBeenCalled();
    });
  });
});
