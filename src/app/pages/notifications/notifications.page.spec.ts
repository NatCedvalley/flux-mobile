import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { FLUX_API } from '../../providers/flux-api.token';
import { PushService } from '../../push/push.service';
import { NotificationsPage } from './notifications.page';

describe('NotificationsPage', () => {
  let component: NotificationsPage;
  let fixture: ComponentFixture<NotificationsPage>;
  let showCard: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    showCard = signal(false);
    await TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: [
        provideRouter([]),
        { provide: FLUX_API, useClass: InMemoryFluxApi },
        { provide: PushService, useValue: { showCard } },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NotificationsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the push card only while push asks for it', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-push-card')).toBeNull();

    showCard.set(true);
    fixture.detectChanges();

    expect(el.querySelector('app-push-card')).not.toBeNull();
  });
});
