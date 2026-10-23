import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { avatarFillIndex } from '@core/people';
import { AuthService } from '../../auth/auth.service';
import { AppLockService } from '../../lock/app-lock.service';
import { WriteQueueService } from '../../offline/write-queue.service';
import { SettingsPage } from './settings.page';

describe('SettingsPage', () => {
  let component: SettingsPage;
  let fixture: ComponentFixture<SettingsPage>;
  let auth: {
    account: ReturnType<typeof signal<Record<string, string> | undefined>>;
    logout: ReturnType<typeof vi.fn>;
  };
  let alert: {
    present: ReturnType<typeof vi.fn>;
    onDidDismiss: ReturnType<typeof vi.fn>;
  };
  let alerts: { create: ReturnType<typeof vi.fn> };
  let lock: {
    available: ReturnType<typeof signal<boolean>>;
    enabled: ReturnType<typeof signal<boolean>>;
    setEnabled: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    auth = {
      account: signal<Record<string, string> | undefined>({
        id: 'account-1',
        email: 'me@flux.test',
        displayName: 'Me Flux',
        timezone: 'Asia/Kuala_Lumpur',
      }),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    alert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn(),
    };
    alerts = { create: vi.fn().mockResolvedValue(alert) };
    lock = {
      available: signal(false),
      enabled: signal(false),
      setEnabled: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: AlertController, useValue: alerts },
        { provide: AppLockService, useValue: lock },
      ],
    }).compileComponents();
  });

  function logoutItem(): HTMLElement {
    const items = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('ion-item')
    );
    const item = items.find((el) => el.textContent?.includes('Log out'));
    expect(item).toBeTruthy();
    return item as HTMLElement;
  }

  async function tapLogoutAndChoose(role: string): Promise<void> {
    alert.onDidDismiss.mockResolvedValue({ role });
    logoutItem().click();
    await vi.waitFor(() => expect(alert.onDidDismiss).toHaveBeenCalled());
    await fixture.whenStable();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function profile(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.profile');
  }

  function profileLines(): string[] {
    return Array.from(profile()?.querySelectorAll('p') ?? []).map(
      (p) => p.textContent?.trim() ?? ''
    );
  }

  it("shows the account's profile", () => {
    const avatar = profile()?.querySelector<HTMLElement>('.avatar');

    expect(avatar?.textContent?.trim()).toBe('MF');
    expect(avatar?.style.background).toBe(
      `var(--flux-avatar-${avatarFillIndex('account-1') + 1})`
    );
    expect(profileLines()).toEqual([
      'Me Flux',
      'me@flux.test',
      'Asia/Kuala_Lumpur',
    ]);
  });

  it('names the account from its first and last name', () => {
    auth.account.set({
      email: 'ada@flux.test',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    fixture.detectChanges();

    expect(profileLines()).toEqual(['Ada Lovelace', 'ada@flux.test']);
  });

  it('shows an account with only an email once', () => {
    auth.account.set({ email: 'ada@flux.test' });
    fixture.detectChanges();

    expect(profile()?.querySelector('.avatar')?.textContent?.trim()).toBe('A');
    expect(profileLines()).toEqual(['ada@flux.test']);
  });

  it('has no profile header without an account', () => {
    auth.account.set(undefined);
    fixture.detectChanges();

    expect(profile()).toBeNull();
  });

  it('links to About', () => {
    const item = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('ion-item')
    ).find((el) => el.textContent?.includes('About'));

    expect(item?.getAttribute('routerLink')).toBe('about');
  });

  it('links to the notification settings', () => {
    const item = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('ion-item')
    ).find((el) => el.textContent?.includes('Notifications'));

    expect(item?.getAttribute('routerLink')).toBe('notifications');
  });

  it('logs out once the user confirms', async () => {
    await tapLogoutAndChoose('confirm');

    expect(alert.present).toHaveBeenCalled();
    expect(auth.logout).toHaveBeenCalled();
  });

  it('says what stays unsent, and keeps it', async () => {
    const writeQueue = TestBed.inject(WriteQueueService);
    await writeQueue.queue.load('a1');
    for (const taskId of ['1', '2']) {
      await writeQueue.enqueueStatus({
        projectId: 'p1',
        taskId,
        from: { slug: 'in_progress' },
        to: { slug: 'todo' },
      });
    }

    await tapLogoutAndChoose('confirm');

    expect(alerts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Log out of Flux?',
        message:
          '2 changes haven’t been sent. They’ll send when you sign in to this account again.',
      })
    );
    expect(writeQueue.waiting()).toBe(2);
  });

  it('asks without a message when nothing is waiting', async () => {
    await tapLogoutAndChoose('cancel');

    expect(alerts.create.mock.calls[0][0].message).toBeUndefined();
  });

  it('stays signed in when the user cancels', async () => {
    await tapLogoutAndChoose('cancel');

    expect(auth.logout).not.toHaveBeenCalled();
  });

  function biometricToggle(): (HTMLElement & { checked?: boolean }) | null {
    return (fixture.nativeElement as HTMLElement).querySelector('ion-toggle');
  }

  it('hides biometric unlock when the device has no biometrics', () => {
    expect(biometricToggle()).toBeNull();
  });

  it('offers biometric unlock when the device has biometrics', () => {
    lock.available.set(true);
    lock.enabled.set(true);
    fixture.detectChanges();

    expect(biometricToggle()?.textContent).toContain('Biometric unlock');
    expect(biometricToggle()?.checked).toBe(true);
  });

  it('saves the biometric unlock choice', () => {
    lock.available.set(true);
    fixture.detectChanges();

    biometricToggle()?.dispatchEvent(
      new CustomEvent('ionChange', { detail: { checked: true } })
    );

    expect(lock.setEnabled).toHaveBeenCalledWith(true);
  });
});
