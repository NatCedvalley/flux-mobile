import { TestBed } from '@angular/core/testing';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { ConnectivityService } from './connectivity.service';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));
vi.mock('@capacitor/network', () => ({
  Network: { getStatus: vi.fn(), addListener: vi.fn() },
}));

describe('ConnectivityService', () => {
  let service: ConnectivityService;
  let listeners: Record<string, (event?: unknown) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Network.getStatus).mockResolvedValue({
      connected: true,
      connectionType: 'wifi',
    });
    listeners = {};
    const listen = ((event: string, listener: (event?: unknown) => void) => {
      listeners[event] = listener;
      return Promise.resolve({ remove: vi.fn() });
    }) as never;
    vi.mocked(App.addListener).mockImplementation(listen);
    vi.mocked(Network.addListener).mockImplementation(listen);
    service = TestBed.inject(ConnectivityService);
  });

  function offline(): void {
    vi.mocked(Network.getStatus).mockResolvedValue({
      connected: false,
      connectionType: 'none',
    });
  }

  it('reads as online before the first check, without asking the OS', () => {
    expect(service.online()).toBe(true);
    expect(Network.getStatus).not.toHaveBeenCalled();
  });

  it('is ready once the first check answers', async () => {
    let ready = false;
    void service.ready.then(() => (ready = true));
    await Promise.resolve();
    expect(ready).toBe(false);

    await service.init();
    await service.ready;

    expect(ready).toBe(true);
  });

  it('starts offline when the OS says so', async () => {
    offline();

    await service.init();

    expect(service.online()).toBe(false);
  });

  it('follows the OS as the connection drops and comes back', async () => {
    await service.init();

    listeners['networkStatusChange']({
      connected: false,
      connectionType: 'none',
    });
    expect(service.online()).toBe(false);

    listeners['networkStatusChange']({
      connected: true,
      connectionType: 'cellular',
    });
    expect(service.online()).toBe(true);
  });

  it('checks again on resume', async () => {
    await service.init();
    offline();

    listeners['resume']();
    await new Promise((resolve) => setTimeout(resolve));

    expect(Network.getStatus).toHaveBeenCalledTimes(2);
    expect(service.online()).toBe(false);
  });

  it('keeps the last value when a check fails', async () => {
    offline();
    await service.init();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(Network.getStatus).mockRejectedValue(new Error('no plugin'));

    listeners['resume']();
    await new Promise((resolve) => setTimeout(resolve));

    expect(service.online()).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});
