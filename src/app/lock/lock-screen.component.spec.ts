import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { WriteQueueService } from '../offline/write-queue.service';
import { AppLockService } from './app-lock.service';
import { LockScreenComponent } from './lock-screen.component';

describe('LockScreenComponent', () => {
  let fixture: ComponentFixture<LockScreenComponent>;
  let lock: { authenticate: ReturnType<typeof vi.fn> };
  let auth: { logout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    lock = { authenticate: vi.fn().mockResolvedValue(undefined) };
    auth = { logout: vi.fn().mockResolvedValue(undefined) };
    await TestBed.configureTestingModule({
      imports: [LockScreenComponent],
      providers: [
        { provide: AppLockService, useValue: lock },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LockScreenComponent);
    fixture.detectChanges();
  });

  function button(label: string): HTMLElement {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('ion-button')
    );
    const found = buttons.find((el) => el.textContent?.includes(label));
    expect(found).toBeTruthy();
    return found as HTMLElement;
  }

  it('prompts as soon as it appears', () => {
    expect(lock.authenticate).toHaveBeenCalledTimes(1);
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('prompts again from Unlock', () => {
    button('Unlock').click();

    expect(lock.authenticate).toHaveBeenCalledTimes(2);
  });

  it('signs out from "Sign in with password"', async () => {
    button('Sign in with password').click();
    await fixture.whenStable();

    expect(auth.logout).toHaveBeenCalled();
  });

  it('says what signing in with a password leaves unsent', async () => {
    const text = () =>
      (fixture.nativeElement as HTMLElement)
        .querySelector('.unsent')
        ?.textContent?.trim();
    expect(text()).toBeUndefined();
    const writeQueue = TestBed.inject(WriteQueueService);
    await writeQueue.queue.load('a1');

    await writeQueue.enqueueComment({
      projectId: 'p1',
      taskId: '1',
      body: 'Hi',
      mentionedAccountIds: [],
    });
    fixture.detectChanges();

    expect(text()).toBe(
      '1 change hasn’t been sent. It’ll send when you sign in to this account again.'
    );
  });
});
