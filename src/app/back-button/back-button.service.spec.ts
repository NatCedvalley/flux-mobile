import { TestBed } from '@angular/core/testing';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NavController, Platform } from '@ionic/angular';
import { BackButtonService } from './back-button.service';

vi.mock('@capacitor/app', () => ({ App: { exitApp: vi.fn() } }));

describe('BackButtonService', () => {
  let service: BackButtonService;
  let subscribe: ReturnType<typeof vi.fn>;
  let pop: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(App.exitApp).mockResolvedValue(undefined);
    subscribe = vi.fn();
    pop = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Platform,
          useValue: { backButton: { subscribeWithPriority: subscribe } },
        },
        { provide: NavController, useValue: { pop } },
      ],
    });
    service = TestBed.inject(BackButtonService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Runs init on Android and returns the registered Back handler. */
  function handler(): () => Promise<void> {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    service.init();
    return subscribe.mock.calls[0][1];
  }

  it("registers between overlays and Ionic's own pop handler", () => {
    handler();

    expect(subscribe).toHaveBeenCalledWith(1, expect.any(Function));
  });

  it('goes back a page when the stack can pop', async () => {
    pop.mockResolvedValue(true);

    await handler()();

    expect(pop).toHaveBeenCalledOnce();
    expect(App.exitApp).not.toHaveBeenCalled();
  });

  it('leaves the app when there is nothing to go back to', async () => {
    pop.mockResolvedValue(false);

    await handler()();

    expect(App.exitApp).toHaveBeenCalledOnce();
  });

  it.each(['ios', 'web'])('does nothing on %s', (platform) => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(platform);

    service.init();

    expect(subscribe).not.toHaveBeenCalled();
  });
});
