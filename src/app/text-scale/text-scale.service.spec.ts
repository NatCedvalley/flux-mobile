import { TestBed } from '@angular/core/testing';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { TextZoom } from '@capacitor/text-zoom';
import { TextScaleService } from './text-scale.service';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));
vi.mock('@capacitor/text-zoom', () => ({
  TextZoom: { getPreferred: vi.fn(), set: vi.fn() },
}));

describe('TextScaleService', () => {
  let service: TextScaleService;
  let listeners: Record<string, () => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.style.removeProperty('--flux-text-scale');
    vi.mocked(TextZoom.getPreferred).mockResolvedValue({ value: 1 });
    vi.mocked(TextZoom.set).mockResolvedValue(undefined);
    listeners = {};
    vi.mocked(App.addListener).mockImplementation(((
      event: string,
      listener: () => void
    ) => {
      listeners[event] = listener;
      return Promise.resolve({ remove: vi.fn() });
    }) as never);
    service = TestBed.inject(TextScaleService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--flux-text-scale');
  });

  function platform(name: 'web' | 'android' | 'ios'): void {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(name !== 'web');
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(name);
  }

  function scale(): string {
    return document.documentElement.style.getPropertyValue('--flux-text-scale');
  }

  it('never calls the plugin on web', async () => {
    platform('web');

    await service.init();

    expect(TextZoom.getPreferred).not.toHaveBeenCalled();
    expect(TextZoom.set).not.toHaveBeenCalled();
    expect(App.addListener).not.toHaveBeenCalled();
    expect(scale()).toBe('');
  });

  it("pins Android's WebView zoom, then applies the clamped size", async () => {
    platform('android');
    vi.mocked(TextZoom.getPreferred).mockResolvedValue({ value: 1.5 });

    await service.init();

    expect(TextZoom.set).toHaveBeenCalledWith({ value: 1 });
    expect(vi.mocked(TextZoom.set).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(TextZoom.getPreferred).mock.invocationCallOrder[0]
    );
    expect(scale()).toBe('1.2');
  });

  it('applies the size on iOS without set()', async () => {
    platform('ios');
    vi.mocked(TextZoom.getPreferred).mockResolvedValue({ value: 1.12 });

    await service.init();

    expect(TextZoom.set).not.toHaveBeenCalled();
    expect(scale()).toBe('1.12');
  });

  it('reads the size again on resume', async () => {
    platform('ios');
    await service.init();
    expect(scale()).toBe('1');

    vi.mocked(TextZoom.getPreferred).mockResolvedValue({ value: 1.1 });
    listeners['resume']();
    await vi.waitFor(() => expect(scale()).toBe('1.1'));
  });

  it('keeps the last size when reading fails', async () => {
    platform('ios');
    vi.mocked(TextZoom.getPreferred).mockResolvedValue({ value: 1.1 });
    await service.init();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.mocked(TextZoom.getPreferred).mockRejectedValue(new Error('gone'));
    listeners['resume']();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());

    expect(scale()).toBe('1.1');
  });
});
