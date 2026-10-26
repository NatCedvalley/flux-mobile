import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Capacitor,
  SystemBarType,
  SystemBars,
  SystemBarsStyle,
} from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ThemeService } from '../theme/theme.service';
import { StatusBarService } from './status-bar.service';

// Whole, not over importOriginal(): in the full suite that hit the module
// before it had loaded. registerPlugin serves the plugins ThemeService
// imports.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: () => ({}),
  SystemBars: { setStyle: vi.fn() },
  SystemBarType: { StatusBar: 'StatusBar', NavigationBar: 'NavigationBar' },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: vi.fn() },
  Style: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

describe('StatusBarService', () => {
  let service: StatusBarService;
  let dark: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(StatusBar.setStyle).mockResolvedValue(undefined);
    vi.mocked(SystemBars.setStyle).mockResolvedValue(undefined);
    dark = signal(false);
    TestBed.configureTestingModule({
      providers: [{ provide: ThemeService, useValue: { dark } }],
    });
    service = TestBed.inject(StatusBarService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never calls the plugin on web', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

    service.init();
    TestBed.tick();

    expect(StatusBar.setStyle).not.toHaveBeenCalled();
    expect(SystemBars.setStyle).not.toHaveBeenCalled();
  });

  it('uses dark text on the light theme', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

    service.init();
    TestBed.tick();

    expect(StatusBar.setStyle).toHaveBeenCalledWith({ style: Style.Light });
  });

  it('follows the theme in effect switching to dark', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    service.init();
    TestBed.tick();

    dark.set(true);
    TestBed.tick();

    expect(StatusBar.setStyle).toHaveBeenLastCalledWith({ style: Style.Dark });
  });

  it('forces light text while a card sheet is open, then follows the theme', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    service.init();
    TestBed.tick();

    service.forceDark(true);
    TestBed.tick();
    expect(StatusBar.setStyle).toHaveBeenLastCalledWith({ style: Style.Dark });

    service.forceDark(false);
    TestBed.tick();
    expect(StatusBar.setStyle).toHaveBeenLastCalledWith({ style: Style.Light });
  });

  it('keeps light text after a card sheet on the dark theme', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    dark.set(true);
    service.init();
    service.forceDark(true);
    TestBed.tick();

    service.forceDark(false);
    TestBed.tick();

    expect(StatusBar.setStyle).toHaveBeenLastCalledWith({ style: Style.Dark });
  });

  it('ignores the override on web', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    service.init();

    service.forceDark(true);
    TestBed.tick();

    expect(StatusBar.setStyle).not.toHaveBeenCalled();
  });

  it('gives the navigation bar dark buttons on the light theme', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

    service.init();
    TestBed.tick();

    expect(SystemBars.setStyle).toHaveBeenCalledWith({
      style: SystemBarsStyle.Light,
      bar: SystemBarType.NavigationBar,
    });
  });

  it("follows the theme with the navigation bar, whatever the OS's", () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    service.init();
    TestBed.tick();

    dark.set(true);
    TestBed.tick();

    expect(SystemBars.setStyle).toHaveBeenLastCalledWith({
      style: SystemBarsStyle.Dark,
      bar: SystemBarType.NavigationBar,
    });
  });

  it('leaves the navigation bar alone while a card sheet is open', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    service.init();
    TestBed.tick();
    vi.mocked(SystemBars.setStyle).mockClear();

    service.forceDark(true);
    TestBed.tick();

    expect(SystemBars.setStyle).not.toHaveBeenCalled();
  });
});
