import type { MockInstance } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError, AuthSession, MemoryTokenStore } from '@core/auth';
import { AnalyticsService } from '../analytics/analytics.service';
import { ConnectivityService } from '../offline/connectivity.service';
import { TOKEN_STORE } from '../providers/token-store.token';
import { AuthService } from './auth.service';

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) },
}));

describe('AuthService', () => {
  let online: ReturnType<typeof signal<boolean>>;
  let markReady: () => void;
  let restore: MockInstance<AuthSession['restore']>;
  let resume: MockInstance<AuthSession['resume']>;
  let service: AuthService;

  beforeEach(() => {
    online = signal(true);
    const ready = new Promise<void>((resolve) => (markReady = resolve));
    restore = vi
      .spyOn(AuthSession.prototype, 'restore')
      .mockResolvedValue(undefined);
    resume = vi
      .spyOn(AuthSession.prototype, 'resume')
      .mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TOKEN_STORE, useValue: new MemoryTokenStore() },
        { provide: ConnectivityService, useValue: { online, ready } },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores once the connection has been checked', async () => {
    void service.restore();
    await Promise.resolve();
    expect(restore).not.toHaveBeenCalled();

    markReady();
    await service.restore();

    expect(restore).toHaveBeenCalledExactlyOnceWith({ offline: false });
  });

  it('restores without the network when offline', async () => {
    online.set(false);
    markReady();

    await service.restore();

    expect(restore).toHaveBeenCalledWith({ offline: true });
  });

  it('resumes the session when the connection comes back', () => {
    online.set(false);
    TestBed.tick();
    resume.mockClear();

    online.set(true);
    TestBed.tick();

    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('counts a sign-in, and not a refused one', async () => {
    const log = vi.spyOn(TestBed.inject(AnalyticsService), 'log');
    const login = vi
      .spyOn(AuthSession.prototype, 'login')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError(401));

    await service.login('ada@acme.test', 'secret');
    await expect(service.login('ada@acme.test', 'wrong')).rejects.toThrow();

    expect(login).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledExactlyOnceWith({
      name: 'login',
      params: { method: 'password' },
    });
  });
});
