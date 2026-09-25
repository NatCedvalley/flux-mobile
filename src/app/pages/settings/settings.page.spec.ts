import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular';
import { buildInfo } from '../../../environments/build-info';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
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
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: AlertController, useValue: alerts },
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
});
