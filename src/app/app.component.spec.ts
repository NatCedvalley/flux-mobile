import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthService } from './auth/auth.service';
import { AppLockService } from './lock/app-lock.service';

describe('AppComponent', () => {
  let locked: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    locked = signal(false);
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: AppLockService,
          useValue: { locked, authenticate: vi.fn() },
        },
        { provide: AuthService, useValue: { logout: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('covers the app with the lock screen while locked', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(element.querySelector('app-lock-screen')).toBeNull();

    locked.set(true);
    fixture.detectChanges();

    expect(element.querySelector('app-lock-screen')).not.toBeNull();
    expect(
      (element.querySelector('ion-router-outlet') as HTMLElement).inert
    ).toBe(true);
  });
});
