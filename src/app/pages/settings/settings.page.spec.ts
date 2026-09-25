import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular';
import { buildInfo } from '../../../environments/build-info';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { AppLockService } from '../../lock/app-lock.service';
import { SettingsPage } from './settings.page';

describe('SettingsPage', () => {
  let component: SettingsPage;
  let fixture: ComponentFixture<SettingsPage>;
  let auth: { account: unknown; logout: ReturnType<typeof vi.fn> };
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
      account: signal({ email: 'me@flux.test', displayName: 'Me Flux' }),
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

  it('shows the active environment and build version', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain(environment.name);
    expect(text).toContain(buildInfo.version);
  });

  it('shows the signed-in account', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Me Flux');
  });

  it('logs out once the user confirms', async () => {
    await tapLogoutAndChoose('confirm');

    expect(alert.present).toHaveBeenCalled();
    expect(auth.logout).toHaveBeenCalled();
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
