import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectivityService } from '../connectivity.service';
import { OfflineBannerComponent } from './offline-banner.component';

/** An ion-icon's `name`, which Angular sets as a property, not an attribute. */
function iconName(icon: Element | null | undefined): string | undefined {
  return (icon as { name?: string } | null | undefined)?.name;
}

describe('OfflineBannerComponent', () => {
  let online: ReturnType<typeof signal<boolean>>;
  let fixture: ComponentFixture<OfflineBannerComponent>;
  let el: HTMLElement;

  beforeEach(() => {
    online = signal(true);
    TestBed.configureTestingModule({
      imports: [OfflineBannerComponent],
      providers: [{ provide: ConnectivityService, useValue: { online } }],
    });
    fixture = TestBed.createComponent(OfflineBannerComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  function setOnline(value: boolean): void {
    online.set(value);
    fixture.detectChanges();
  }

  it('shows nothing while online', () => {
    expect(el.querySelector('.banner')).toBeNull();
  });

  it('says it is offline', () => {
    setOnline(false);

    const banner = el.querySelector('.banner');
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.textContent?.trim()).toBe('Offline · showing cached work');
    expect(iconName(banner?.querySelector('ion-icon'))).toBe('cloud-off');
  });

  it('clears when the connection comes back', () => {
    setOnline(false);
    setOnline(true);

    expect(el.querySelector('.banner')).toBeNull();
  });
});
