import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { ThemeService } from './theme.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: vi.fn(), set: vi.fn() },
}));

describe('ThemeService', () => {
  let service: ThemeService;
  let osDark: boolean;
  let onChange: (() => void) | undefined;
  const classList = document.documentElement.classList;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Preferences.get).mockResolvedValue({ value: null });
    vi.mocked(Preferences.set).mockResolvedValue(undefined);
    osDark = false;
    onChange = undefined;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          get matches() {
            return osDark;
          },
          media: query,
          addEventListener: (_: string, listener: () => void) => {
            onChange = listener;
          },
        }) as unknown as MediaQueryList
    );
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    classList.remove('flux-theme-light', 'flux-theme-dark');
  });

  it('follows the OS when nothing is stored', async () => {
    await service.init();

    expect(service.preference()).toBe('system');
    expect(classList.contains('flux-theme-light')).toBe(false);
    expect(classList.contains('flux-theme-dark')).toBe(false);
    expect(service.dark()).toBe(false);

    osDark = true;
    onChange?.();
    expect(service.dark()).toBe(true);
  });

  it('applies the stored choice at startup', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'dark' });

    await service.init();

    expect(Preferences.get).toHaveBeenCalledWith({ key: 'theme' });
    expect(service.preference()).toBe('dark');
    expect(classList.contains('flux-theme-dark')).toBe(true);
    expect(service.dark()).toBe(true);
  });

  it('keeps an override whatever the OS does', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: 'light' });
    await service.init();

    osDark = true;
    onChange?.();

    expect(classList.contains('flux-theme-light')).toBe(true);
    expect(service.dark()).toBe(false);
  });

  it('falls back to System for an unknown value or a failed read', async () => {
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: 'sepia' });
    await service.init();
    expect(service.preference()).toBe('system');

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('boom'));
    await expect(service.init()).resolves.toBeUndefined();
    expect(service.preference()).toBe('system');
  });

  it('applies a new choice at once and saves it', async () => {
    await service.init();

    const saving = service.set('dark');
    expect(classList.contains('flux-theme-dark')).toBe(true);
    await saving;
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'theme',
      value: 'dark',
    });

    await service.set('light');
    expect(classList.contains('flux-theme-dark')).toBe(false);
    expect(classList.contains('flux-theme-light')).toBe(true);

    await service.set('system');
    expect(classList.contains('flux-theme-light')).toBe(false);
    expect(classList.contains('flux-theme-dark')).toBe(false);
  });
});
