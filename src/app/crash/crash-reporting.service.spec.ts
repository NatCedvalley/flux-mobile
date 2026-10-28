import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Account } from '@core/api';
import { buildInfo } from '../../environments/build-info';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CrashReportingService } from './crash-reporting.service';

vi.mock('@capacitor/app', () => ({ App: { getInfo: vi.fn() } }));
vi.mock('@capacitor-firebase/crashlytics', () => ({
  FirebaseCrashlytics: {
    setEnabled: vi.fn(),
    setCustomKey: vi.fn(),
    setUserId: vi.fn(),
    recordException: vi.fn(),
  },
}));

describe('CrashReportingService', () => {
  let service: CrashReportingService;
  let account: ReturnType<typeof signal<Account | null>>;
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
    vi.mocked(App.getInfo).mockResolvedValue({
      name: 'Flux',
      id: 'asia.justflux.mobile',
      build: '42',
      version: '0.0.1 (42)',
    });
    vi.mocked(FirebaseCrashlytics.setEnabled).mockResolvedValue();
    vi.mocked(FirebaseCrashlytics.setCustomKey).mockResolvedValue();
    vi.mocked(FirebaseCrashlytics.setUserId).mockResolvedValue();
    vi.mocked(FirebaseCrashlytics.recordException).mockResolvedValue();

    account = signal<Account | null>({ id: 'u1', email: 'ada@acme.test' });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { account, restore: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    buildInfo.push = builtWith;
    env.name = envName;
  });

  function create(): CrashReportingService {
    service = TestBed.inject(CrashReportingService);
    return service;
  }

  /** Lets `init`'s restore-then-watch chain and its effect run. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  it.each([
    ['on web', () => (native = false)],
    ['without the Firebase config', () => (buildInfo.push.android = false)],
  ])('never calls the plugin %s', async (_, arrange) => {
    arrange();

    await create().init();
    await service.record(new Error('boom'));
    await settle();

    expect(service.enabled).toBe(false);
    for (const method of Object.values(FirebaseCrashlytics)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it('only turns collection off in a dev build', async () => {
    env.name = 'dev';

    await create().init();
    await service.record(new Error('boom'));
    await settle();

    expect(service.enabled).toBe(false);
    expect(FirebaseCrashlytics.setEnabled).toHaveBeenCalledWith({
      enabled: false,
    });
    expect(FirebaseCrashlytics.setCustomKey).not.toHaveBeenCalled();
    expect(FirebaseCrashlytics.setUserId).not.toHaveBeenCalled();
    expect(FirebaseCrashlytics.recordException).not.toHaveBeenCalled();
  });

  it.each(['staging', 'prod'])(
    'turns collection on and tags the build in %s',
    async (name) => {
      env.name = name;

      await create().init();

      expect(service.enabled).toBe(true);
      expect(FirebaseCrashlytics.setEnabled).toHaveBeenCalledWith({
        enabled: true,
      });
      expect(
        vi
          .mocked(FirebaseCrashlytics.setCustomKey)
          .mock.calls.map(([key]) => key)
      ).toEqual([
        { key: 'environment', value: name, type: 'string' },
        { key: 'version', value: buildInfo.version, type: 'string' },
        { key: 'build', value: '42', type: 'string' },
        { key: 'commit', value: buildInfo.commit, type: 'string' },
      ]);
    }
  );

  it("is on in an iOS build with iOS's config file", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    buildInfo.push.android = false;

    await create().init();

    expect(service.enabled).toBe(true);
  });

  it("sets the account's id as the user, and clears it on sign-out", async () => {
    await create().init();
    await settle();

    expect(FirebaseCrashlytics.setUserId).toHaveBeenLastCalledWith({
      userId: 'u1',
    });

    account.set(null);
    TestBed.tick();

    expect(FirebaseCrashlytics.setUserId).toHaveBeenLastCalledWith({
      userId: '',
    });
  });

  it('logs a failed user id without breaking', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(FirebaseCrashlytics.setUserId).mockRejectedValue(new Error('no'));

    await create().init();
    await settle();
    await settle();

    expect(log).toHaveBeenCalledWith(
      'Setting the crash reporting user failed',
      expect.any(Error)
    );
  });

  it('stays quiet when setting up fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(FirebaseCrashlytics.setEnabled).mockRejectedValue(
      new Error('not configured')
    );

    await expect(create().init()).resolves.toBeUndefined();
    await settle();

    expect(log).toHaveBeenCalledWith(
      'Setting up crash reporting failed',
      expect.any(Error)
    );
    expect(FirebaseCrashlytics.setUserId).not.toHaveBeenCalled();
  });

  it('records an error with its frames', async () => {
    const error = new TypeError('x is undefined');
    error.stack =
      'TypeError: x is undefined\n    at f (https://localhost/main.js:1:99)';

    await create().record(error);

    expect(FirebaseCrashlytics.recordException).toHaveBeenCalledWith({
      message: 'TypeError: x is undefined',
      stacktrace: [
        { functionName: 'f (column 99)', fileName: 'main.js', lineNumber: 1 },
      ],
    });
  });

  it('only logs a failed record', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(FirebaseCrashlytics.recordException).mockRejectedValue(
      new Error('no')
    );

    await expect(create().record('boom')).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      'Recording an error failed',
      expect.any(Error)
    );
  });
});
