import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Capacitor, type PermissionState } from '@capacitor/core';
import { ToastController } from '@ionic/angular';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { FLUX_API } from '../../providers/flux-api.token';
import { PushService } from '../../push/push.service';
import { NotificationSettingsPage } from './notification-settings.page';

type Toggle = HTMLElement & { checked?: boolean; disabled?: boolean };

describe('NotificationSettingsPage', () => {
  let fixture: ComponentFixture<NotificationSettingsPage>;
  let api: InMemoryFluxApi;
  let push: {
    available: boolean;
    permission: ReturnType<typeof signal<PermissionState | null>>;
    enable: ReturnType<typeof vi.fn>;
    openSettings: ReturnType<typeof vi.fn>;
  };
  let toasts: { create: ReturnType<typeof vi.fn> };
  let native: boolean;

  beforeEach(() => {
    native = true;
    vi.spyOn(Capacitor, 'isNativePlatform').mockImplementation(() => native);
    api = new InMemoryFluxApi();
    push = {
      available: true,
      permission: signal<PermissionState | null>('granted'),
      enable: vi.fn().mockResolvedValue(undefined),
      openSettings: vi.fn().mockResolvedValue(undefined),
    };
    toasts = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() }),
    };
    TestBed.configureTestingModule({
      imports: [NotificationSettingsPage],
      providers: [
        { provide: FLUX_API, useValue: api },
        { provide: PushService, useValue: push },
        { provide: ToastController, useValue: toasts },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(NotificationSettingsPage);
    await settle();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const toggles = () => Array.from(el().querySelectorAll<Toggle>('ion-toggle'));
  const toggle = (label: string) => {
    const found = toggles().find((t) => t.textContent?.trim() === label);
    expect(found).toBeTruthy();
    return found as Toggle;
  };
  const button = (label: string) =>
    Array.from(el().querySelectorAll('ion-button')).find((b) =>
      b.textContent?.includes(label)
    ) as HTMLElement | undefined;

  async function flip(label: string, checked: boolean): Promise<void> {
    toggle(label).dispatchEvent(
      new CustomEvent('ionChange', { detail: { checked } })
    );
    await settle();
  }

  it('lists the groups under their sections, all on to start', async () => {
    await create();

    expect(text()).toContain('About me');
    expect(text()).toContain('Tasks I watch');
    expect(text()).toContain('Projects I watch');
    expect(toggles()).toHaveLength(7);
    expect(toggles().every((t) => t.checked && !t.disabled)).toBe(true);
    expect(text()).toContain('The Inbox still lists every notification.');
  });

  it('shows a group on while any of its types is', async () => {
    await api.updatePushPreferences([{ type: 'MENTION', enabled: false }]);
    await api.updatePushPreferences([{ type: 'REACTION', enabled: false }]);

    await create();

    expect(toggle('Mentions').checked).toBe(true);
    expect(toggle('Reactions to my comments').checked).toBe(false);
  });

  it('saves a group by writing every one of its types', async () => {
    const save = vi.spyOn(api, 'updatePushPreferences');
    await create();

    await flip('Mentions', false);

    expect(save).toHaveBeenCalledExactlyOnceWith([
      { type: 'MENTION', enabled: false },
      { type: 'DESCRIPTION_MENTION', enabled: false },
    ]);
    expect(toggle('Mentions').checked).toBe(false);
    const saved = await api.pushPreferences();
    expect(saved.filter((p) => !p.enabled).map((p) => p.type)).toEqual([
      'MENTION',
      'DESCRIPTION_MENTION',
    ]);
  });

  it('puts the toggle back with the server’s message when the save fails', async () => {
    vi.spyOn(api, 'updatePushPreferences').mockRejectedValue(
      new ApiError(500, { message: 'Push is down' })
    );
    await create();

    await flip('Comments', false);
    await settle();

    expect(toggle('Comments').checked).toBe(true);
    expect(toasts.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Push is down' })
    );
  });

  it('offers Turn on while the OS would still ask, with the toggles off limits', async () => {
    push.permission.set('prompt');
    await create();

    expect(text()).toContain('Notifications are off');
    expect(text()).toContain('Turn on notifications to choose');
    expect(toggles().every((t) => t.disabled)).toBe(true);

    button('Turn on')?.click();
    expect(push.enable).toHaveBeenCalled();
  });

  it('offers Open settings once permission is denied', async () => {
    push.permission.set('denied');
    await create();

    expect(text()).toContain('blocked in your phone');
    expect(toggles().every((t) => t.disabled)).toBe(true);

    button('Open settings')?.click();
    expect(push.openSettings).toHaveBeenCalled();
  });

  it('enables the toggles when permission comes back granted', async () => {
    push.permission.set('denied');
    await create();

    push.permission.set('granted');
    await settle();

    expect(text()).toContain('Notifications are on');
    expect(text()).not.toContain('Turn on notifications to choose');
    expect(toggles().every((t) => !t.disabled)).toBe(true);
  });

  it('says push is only on the phone apps on web', async () => {
    native = false;
    push.available = false;
    push.permission.set(null);
    await create();

    expect(text()).toContain('only on the Flux phone apps');
    expect(button('Turn on')).toBeUndefined();
    expect(toggles().every((t) => t.disabled)).toBe(true);
  });

  it('says so in a build without push', async () => {
    push.available = false;
    push.permission.set(null);
    await create();

    expect(text()).toContain("Push isn't set up in this build.");
  });

  it('shows Retry when the preferences fail to load', async () => {
    vi.spyOn(api, 'pushPreferences').mockRejectedValue(new ApiError(0, {}));
    await create();

    expect(el().querySelector('app-error-state')).not.toBeNull();
    expect(toggles()).toHaveLength(0);
  });
});
