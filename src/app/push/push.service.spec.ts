import type { Mock } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { NativeSettings } from 'capacitor-native-settings';
import type { Account, FluxApi } from '@core/api';
import { buildInfo } from '../../environments/build-info';
import { AuthService } from '../auth/auth.service';
import { FLUX_API } from '../providers/flux-api.token';
import { NotificationState } from './notification-state';
import { PushService, TASK_UPDATES_CHANNEL } from './push.service';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: vi.fn(), set: vi.fn() },
}));
vi.mock('capacitor-native-settings', () => ({
  AndroidSettings: { AppNotification: 'app_notification' },
  IOSSettings: { AppNotification: 'appNotification' },
  NativeSettings: { open: vi.fn() },
}));
vi.mock('@capacitor-firebase/messaging', () => ({
  Importance: { Default: 3 },
  FirebaseMessaging: {
    createChannel: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    getToken: vi.fn(),
    addListener: vi.fn(),
  },
}));

describe('PushService', () => {
  let service: PushService;
  let account: ReturnType<typeof signal<Account | null>>;
  let api: {
    registerDevice: Mock<FluxApi['registerDevice']>;
    unregisterDevice: Mock<FluxApi['unregisterDevice']>;
  };
  let setBeforeLogout: ReturnType<typeof vi.fn>;
  let listeners: Record<string, (event?: unknown) => void>;
  let native: boolean;
  let platform: string;
  const builtWith = buildInfo.push;

  beforeEach(() => {
    vi.clearAllMocks();
    native = true;
    platform = 'android';
    // As if both Firebase config files were present at build time.
    buildInfo.push = { android: true, ios: true };
    vi.spyOn(Capacitor, 'isNativePlatform').mockImplementation(() => native);
    vi.spyOn(Capacitor, 'getPlatform').mockImplementation(() => platform);
    vi.mocked(FirebaseMessaging.createChannel).mockResolvedValue(undefined);
    vi.mocked(FirebaseMessaging.checkPermissions).mockResolvedValue({
      receive: 'prompt',
    });
    vi.mocked(FirebaseMessaging.requestPermissions).mockResolvedValue({
      receive: 'granted',
    });
    vi.mocked(FirebaseMessaging.getToken).mockResolvedValue({ token: 't1' });
    vi.spyOn(NotificationState, 'check').mockResolvedValue({ enabled: true });
    vi.mocked(Preferences.get).mockResolvedValue({ value: null });
    vi.mocked(Preferences.set).mockResolvedValue(undefined);
    listeners = {};
    const listen = ((event: string, listener: (event?: unknown) => void) => {
      listeners[event] = listener;
      return Promise.resolve({ remove: vi.fn() });
    }) as never;
    vi.mocked(App.addListener).mockImplementation(listen);
    vi.mocked(FirebaseMessaging.addListener).mockImplementation(listen);

    account = signal<Account | null>({ id: 'u1' });
    setBeforeLogout = vi.fn();
    api = {
      registerDevice: vi.fn<FluxApi['registerDevice']>().mockResolvedValue(),
      unregisterDevice: vi
        .fn<FluxApi['unregisterDevice']>()
        .mockResolvedValue(),
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            account,
            setBeforeLogout,
            restore: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: FLUX_API, useValue: api },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    buildInfo.push = builtWith;
  });

  function create(): PushService {
    service = TestBed.inject(PushService);
    return service;
  }

  /** Lets `init`'s restore-then-watch chain, its effect and the queue run. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }

  it.each([
    ['on web', () => (native = false)],
    ['without the Firebase config', () => (buildInfo.push.android = false)],
  ])('stays off %s', async (_, arrange) => {
    arrange();

    await create().init();

    expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
    expect(FirebaseMessaging.getToken).not.toHaveBeenCalled();
    expect(setBeforeLogout).not.toHaveBeenCalled();
    expect(service.showCard()).toBe(false);
    expect(service.available).toBe(false);
    expect(service.permission()).toBeNull();
  });

  it('creates the Task updates channel on Android', async () => {
    await create().init();

    expect(FirebaseMessaging.createChannel).toHaveBeenCalledWith({
      id: TASK_UPDATES_CHANNEL,
      name: 'Task updates',
      importance: 3,
    });
  });

  it('shows the card while the OS would prompt, without prompting', async () => {
    await create().init();
    await settle();

    expect(service.showCard()).toBe(true);
    expect(FirebaseMessaging.requestPermissions).not.toHaveBeenCalled();
    expect(FirebaseMessaging.getToken).not.toHaveBeenCalled();
    expect(api.registerDevice).not.toHaveBeenCalled();
  });

  it.each(['granted', 'denied'] as const)(
    'hides the card once permission is %s',
    async (receive) => {
      vi.mocked(FirebaseMessaging.checkPermissions).mockResolvedValue({
        receive,
      });

      await create().init();

      expect(service.showCard()).toBe(false);
    }
  );

  it('keeps the card hidden once dismissed', async () => {
    await create().init();

    await service.dismissCard();

    expect(service.showCard()).toBe(false);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'push.cardDismissed',
      value: 'true',
    });
  });

  it('remembers a dismissal across launches', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'true' });

    await create().init();

    expect(service.showCard()).toBe(false);
  });

  it('registers the token for the signed-in account once allowed', async () => {
    await create().init();
    await settle();

    await service.enable();
    await settle();

    expect(service.showCard()).toBe(false);
    expect(api.registerDevice).toHaveBeenCalledExactlyOnceWith({
      token: 't1',
      platform: 'ANDROID',
      appVersion: buildInfo.version,
    });
  });

  it('registers nothing when the prompt is denied', async () => {
    vi.mocked(FirebaseMessaging.requestPermissions).mockResolvedValue({
      receive: 'denied',
    });
    await create().init();

    await service.enable();
    await settle();

    expect(FirebaseMessaging.getToken).not.toHaveBeenCalled();
    expect(service.showCard()).toBe(false);
  });

  it('registers after permission is granted in the OS settings', async () => {
    await create().init();
    await settle();
    vi.mocked(FirebaseMessaging.checkPermissions).mockResolvedValue({
      receive: 'granted',
    });

    listeners['resume']();
    await settle();

    expect(service.showCard()).toBe(false);
    expect(service.permission()).toBe('granted');
    expect(api.registerDevice).toHaveBeenCalledTimes(1);
  });

  it('reports the permission it read', async () => {
    await create().init();

    expect(service.available).toBe(true);
    expect(service.permission()).toBe('prompt');
  });

  it('opens the app’s notification settings', async () => {
    vi.mocked(NativeSettings.open).mockResolvedValue({ status: true });

    await create().openSettings();

    expect(NativeSettings.open).toHaveBeenCalledWith({
      optionAndroid: 'app_notification',
      optionIOS: 'appNotification',
    });
  });

  describe('with permission granted', () => {
    beforeEach(() => {
      vi.mocked(FirebaseMessaging.checkPermissions).mockResolvedValue({
        receive: 'granted',
      });
    });

    it('reads notifications switched off for the app as denied on Android', async () => {
      vi.mocked(NotificationState.check).mockResolvedValue({ enabled: false });

      await create().init();
      await settle();

      expect(service.permission()).toBe('denied');
      expect(FirebaseMessaging.getToken).not.toHaveBeenCalled();
    });

    it('reads them as allowed again once switched back on', async () => {
      vi.mocked(NotificationState.check).mockResolvedValue({ enabled: false });
      await create().init();
      await settle();
      vi.mocked(NotificationState.check).mockResolvedValue({ enabled: true });

      listeners['resume']();
      await settle();

      expect(service.permission()).toBe('granted');
      expect(api.registerDevice).toHaveBeenCalledTimes(1);
    });

    it('doesn’t ask Android’s switch on an iPhone', async () => {
      platform = 'ios';

      await create().init();

      expect(NotificationState.check).not.toHaveBeenCalled();
      expect(service.permission()).toBe('granted');
    });

    it('registers on launch, as IOS on an iPhone', async () => {
      platform = 'ios';

      await create().init();
      await settle();

      expect(FirebaseMessaging.createChannel).not.toHaveBeenCalled();
      expect(api.registerDevice).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ token: 't1', platform: 'IOS' })
      );
    });

    it('registers again when the token refreshes or another account signs in', async () => {
      await create().init();
      await settle();

      listeners['tokenReceived']({ token: 't2' });
      await settle();
      account.set(null);
      await settle();
      account.set({ id: 'u2' });
      await settle();

      expect(api.registerDevice.mock.calls.map(([d]) => d.token)).toEqual([
        't1',
        't2',
        't2',
      ]);
    });

    it('unregisters the token before the logout', async () => {
      await create().init();
      await settle();

      const hook = setBeforeLogout.mock.calls[0][0] as () => Promise<void>;
      await hook();

      expect(api.unregisterDevice).toHaveBeenCalledExactlyOnceWith('t1');
    });

    it('stays quiet when FCM can’t give a token', async () => {
      vi.mocked(FirebaseMessaging.getToken).mockRejectedValue(
        new Error('unavailable')
      );
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(create().init()).resolves.toBeUndefined();
      await settle();

      expect(api.registerDevice).not.toHaveBeenCalled();
    });
  });
});
