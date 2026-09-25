import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LOCK_TIMEOUT_MS } from '@core/lock';
import { AuthService } from '../auth/auth.service';
import { AppLockService } from './app-lock.service';

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: { checkBiometry: vi.fn(), authenticate: vi.fn() },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: vi.fn(), set: vi.fn() },
}));

describe('AppLockService', () => {
  let service: AppLockService;
  let signedIn: ReturnType<typeof signal<boolean>>;
  let listeners: Record<string, () => void>;
  let native: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    native = true;
    vi.spyOn(Capacitor, 'isNativePlatform').mockImplementation(() => native);
    vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
      isAvailable: true,
    } as never);
    vi.mocked(BiometricAuth.authenticate).mockResolvedValue(undefined);
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'true' });
    vi.mocked(Preferences.set).mockResolvedValue(undefined);
    listeners = {};
    vi.mocked(App.addListener).mockImplementation(((
      event: string,
      listener: () => void
    ) => {
      listeners[event] = listener;
      return Promise.resolve({ remove: vi.fn() });
    }) as never);

    signedIn = signal(true);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isSignedIn: signedIn,
            restore: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
    service = TestBed.inject(AppLockService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Lets `init`'s restore-then-watch chain and its effect run. */
  async function settle(): Promise<void> {
    await vi.runAllTimersAsync();
    TestBed.tick();
  }

  async function resumeAfter(ms: number): Promise<void> {
    listeners['pause']();
    vi.advanceTimersByTime(ms);
    listeners['resume']();
    await settle();
  }

  it('locks a cold start when the user turned the lock on', async () => {
    await service.init();

    expect(service.available()).toBe(true);
    expect(service.enabled()).toBe(true);
    expect(service.locked()).toBe(true);
  });

  it('does not lock a cold start when the lock is off', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: null });

    await service.init();

    expect(service.locked()).toBe(false);
  });

  it('does not lock when the device has no biometrics', async () => {
    vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
      isAvailable: false,
    } as never);

    await service.init();

    expect(service.available()).toBe(false);
    expect(service.locked()).toBe(false);
  });

  it('does nothing on web', async () => {
    native = false;

    await service.init();

    expect(Preferences.get).not.toHaveBeenCalled();
    expect(App.addListener).not.toHaveBeenCalled();
    expect(service.available()).toBe(false);
    expect(service.locked()).toBe(false);
  });

  it('stays off when loading the setting fails', async () => {
    vi.mocked(Preferences.get).mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.init()).resolves.toBeUndefined();

    expect(service.locked()).toBe(false);
  });

  it('forgets the lock when the cold start ends signed out', async () => {
    signedIn.set(false);
    await service.init();
    await settle();

    signedIn.set(true);

    expect(service.locked()).toBe(false);
  });

  it('forgets the lock when the session ends', async () => {
    await service.init();
    await settle();

    signedIn.set(false);
    TestBed.tick();
    signedIn.set(true);

    expect(service.locked()).toBe(false);
  });

  it('unlocks after a successful check', async () => {
    await service.init();

    await service.authenticate();

    expect(BiometricAuth.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ allowDeviceCredential: true })
    );
    expect(service.locked()).toBe(false);
  });

  it('stays locked when the check is cancelled or fails', async () => {
    vi.mocked(BiometricAuth.authenticate).mockRejectedValue(
      new Error('userCancel')
    );
    await service.init();

    await service.authenticate();

    expect(service.locked()).toBe(true);
  });

  describe('on resume', () => {
    beforeEach(async () => {
      await service.init();
      await service.authenticate();
      await settle();
    });

    it('stays unlocked after a short trip to the background', async () => {
      await resumeAfter(LOCK_TIMEOUT_MS - 1);

      expect(service.locked()).toBe(false);
    });

    it('locks after the timeout', async () => {
      await resumeAfter(LOCK_TIMEOUT_MS);

      expect(service.locked()).toBe(true);
    });

    it('stands down when biometrics were removed meanwhile', async () => {
      vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
        isAvailable: false,
      } as never);

      await resumeAfter(LOCK_TIMEOUT_MS);

      expect(service.locked()).toBe(false);
    });

    it('ignores the pause caused by the prompt itself', async () => {
      await resumeAfter(LOCK_TIMEOUT_MS);
      let finish!: () => void;
      vi.mocked(BiometricAuth.authenticate).mockReturnValue(
        new Promise((resolve) => (finish = resolve))
      );

      // Android's prompt activity pauses the app; the resume can arrive
      // after the check has already succeeded.
      const prompt = service.authenticate();
      listeners['pause']();
      vi.advanceTimersByTime(LOCK_TIMEOUT_MS);
      finish();
      await prompt;
      listeners['resume']();
      await settle();

      expect(service.locked()).toBe(false);
    });
  });

  it('saves the choice and stops locking once turned off', async () => {
    await service.init();

    await service.setEnabled(false);

    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'biometricUnlock',
      value: 'false',
    });
    expect(service.enabled()).toBe(false);
    expect(service.locked()).toBe(false);
  });
});
