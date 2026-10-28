import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { Capacitor } from '@capacitor/core';
import { buildInfo } from '../../environments/build-info';
import { environment } from '../../environments/environment';
import { ConnectivityService } from '../offline/connectivity.service';
import { AnalyticsService } from './analytics.service';

vi.mock('@capacitor-firebase/analytics', () => ({
  FirebaseAnalytics: {
    setEnabled: vi.fn(),
    setUserProperty: vi.fn(),
    setCurrentScreen: vi.fn(),
    logEvent: vi.fn(),
  },
}));

@Component({ template: '' })
class BlankComponent {}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let online: ReturnType<typeof signal<boolean>>;
  let native: boolean;
  const builtWith = buildInfo.push;
  const env = environment as { name: string };
  const envName = env.name;

  beforeEach(() => {
    vi.clearAllMocks();
    native = true;
    env.name = 'prod';
    buildInfo.push = { android: true, ios: true };
    vi.spyOn(Capacitor, 'isNativePlatform').mockImplementation(() => native);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    vi.mocked(FirebaseAnalytics.setEnabled).mockResolvedValue();
    vi.mocked(FirebaseAnalytics.setUserProperty).mockResolvedValue();
    vi.mocked(FirebaseAnalytics.setCurrentScreen).mockResolvedValue();
    vi.mocked(FirebaseAnalytics.logEvent).mockResolvedValue();

    online = signal(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'tabs',
            children: [
              {
                path: 'inbox',
                children: [
                  { path: '', component: BlankComponent },
                  {
                    path: 'tasks/:projectId/:taskId',
                    component: BlankComponent,
                  },
                ],
              },
            ],
          },
        ]),
        {
          provide: ConnectivityService,
          useValue: { online, ready: Promise.resolve() },
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    buildInfo.push = builtWith;
    env.name = envName;
  });

  function create(): AnalyticsService {
    service = TestBed.inject(AnalyticsService);
    return service;
  }

  /** Lets `init`'s setup, the effect and the plugin calls run. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }

  const navigate = (url: string) => TestBed.inject(Router).navigateByUrl(url);

  const loggedEvents = () =>
    vi.mocked(FirebaseAnalytics.logEvent).mock.calls.map(([event]) => event);

  it.each([
    ['on web', () => (native = false)],
    ['without the Firebase config', () => (buildInfo.push.android = false)],
  ])('never calls the plugin %s', async (_, arrange) => {
    arrange();

    await create().init();
    await navigate('/tabs/inbox');
    await service.log({ name: 'login', params: { method: 'password' } });
    online.set(false);
    await settle();

    expect(service.enabled).toBe(false);
    for (const method of Object.values(FirebaseAnalytics)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it('only turns collection off in a dev build', async () => {
    env.name = 'dev';

    await create().init();
    await navigate('/tabs/inbox');
    await service.log({ name: 'login', params: { method: 'password' } });
    online.set(false);
    await settle();

    expect(service.enabled).toBe(false);
    expect(FirebaseAnalytics.setEnabled).toHaveBeenCalledWith({
      enabled: false,
    });
    expect(FirebaseAnalytics.setUserProperty).not.toHaveBeenCalled();
    expect(FirebaseAnalytics.setCurrentScreen).not.toHaveBeenCalled();
    expect(FirebaseAnalytics.logEvent).not.toHaveBeenCalled();
  });

  it.each(['staging', 'prod'])(
    'turns collection on and tags the environment in %s',
    async (name) => {
      env.name = name;

      await create().init();

      expect(service.enabled).toBe(true);
      expect(FirebaseAnalytics.setEnabled).toHaveBeenCalledWith({
        enabled: true,
      });
      expect(FirebaseAnalytics.setUserProperty).toHaveBeenCalledWith({
        key: 'environment',
        value: name,
      });
    }
  );

  it('logs an event', async () => {
    await create().init();

    await service.log({
      name: 'push_open',
      params: { from: 'tap', target: 'task' },
    });

    expect(FirebaseAnalytics.logEvent).toHaveBeenCalledWith({
      name: 'push_open',
      params: { from: 'tap', target: 'task' },
    });
  });

  it('logs a screen by its route pattern, without ids or the query', async () => {
    await create().init();

    await navigate('/tabs/inbox/tasks/p1/t1?from=push');
    await settle();

    expect(FirebaseAnalytics.setCurrentScreen).toHaveBeenCalledExactlyOnceWith({
      screenName: 'tabs/inbox/tasks/:projectId/:taskId',
    });
  });

  it('keeps a screen shown while setting up until collection is on', async () => {
    let turnedOn!: () => void;
    vi.mocked(FirebaseAnalytics.setEnabled).mockReturnValue(
      new Promise((resolve) => (turnedOn = resolve))
    );
    const setUp = create().init();

    await navigate('/tabs/inbox');
    await settle();
    expect(FirebaseAnalytics.setCurrentScreen).not.toHaveBeenCalled();

    turnedOn();
    await setUp;
    await settle();
    expect(FirebaseAnalytics.setCurrentScreen).toHaveBeenCalledWith({
      screenName: 'tabs/inbox',
    });
  });

  it('logs each spell offline once', async () => {
    await create().init();
    await settle();
    expect(loggedEvents()).toEqual([]);

    online.set(false);
    await settle();
    online.set(true);
    await settle();
    online.set(false);
    await settle();

    expect(loggedEvents()).toEqual([
      { name: 'offline_start', params: {} },
      { name: 'offline_start', params: {} },
    ]);
  });

  it('logs a cold start that is already offline', async () => {
    online.set(false);

    await create().init();
    await settle();

    expect(loggedEvents()).toEqual([{ name: 'offline_start', params: {} }]);
  });

  it('stays quiet and off when setting up fails', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.mocked(FirebaseAnalytics.setEnabled).mockRejectedValue(
      new Error('not configured')
    );

    await expect(create().init()).resolves.toBeUndefined();
    await navigate('/tabs/inbox');
    await service.log({ name: 'login', params: { method: 'password' } });
    await settle();

    expect(error).toHaveBeenCalledWith(
      'Setting up analytics failed',
      expect.any(Error)
    );
    expect(FirebaseAnalytics.setCurrentScreen).not.toHaveBeenCalled();
    expect(FirebaseAnalytics.logEvent).not.toHaveBeenCalled();
  });

  it('only logs a failed event or screen', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.mocked(FirebaseAnalytics.logEvent).mockRejectedValue(new Error('no'));
    vi.mocked(FirebaseAnalytics.setCurrentScreen).mockRejectedValue(
      new Error('no')
    );
    await create().init();

    await expect(
      service.log({ name: 'login', params: { method: 'password' } })
    ).resolves.toBeUndefined();
    await navigate('/tabs/inbox');
    await settle();

    expect(error).toHaveBeenCalledWith(
      'Logging a usage event failed',
      expect.any(Error)
    );
    expect(error).toHaveBeenCalledWith(
      'Logging a screen failed',
      expect.any(Error)
    );
  });
});
