import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { StatusBarService } from './status-bar.service';

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: vi.fn() },
  Style: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

describe('StatusBarService', () => {
  let service: StatusBarService;
  let dark: boolean;
  let onChange: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(StatusBar.setStyle).mockResolvedValue(undefined);
    dark = false;
    onChange = undefined;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          get matches() {
            return dark;
          },
          media: query,
          addEventListener: (_: string, listener: () => void) => {
            onChange = listener;
          },
        }) as unknown as MediaQueryList
    );
    service = TestBed.inject(StatusBarService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never calls the plugin on web', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

    service.init();

    expect(StatusBar.setStyle).not.toHaveBeenCalled();
  });

  it('uses dark text on the light theme', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

    service.init();

    expect(StatusBar.setStyle).toHaveBeenCalledWith({ style: Style.Light });
  });

  it('follows the OS switching to dark', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    service.init();

    dark = true;
    onChange?.();

    expect(StatusBar.setStyle).toHaveBeenLastCalledWith({ style: Style.Dark });
  });
});
