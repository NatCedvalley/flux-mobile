import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiError } from '@core/auth';
import { AuthService } from '../../auth/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let auth: {
    login: ReturnType<typeof vi.fn>;
    endedMessage: ReturnType<typeof signal<string | null>>;
  };
  let router: Router;

  beforeEach(async () => {
    auth = { login: vi.fn(), endedMessage: signal<string | null>(null) };
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
  });

  async function submitWith(email: string, password: string): Promise<void> {
    const component = fixture.componentInstance as any;
    component.form.setValue({ email, password });
    await component.submit();
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('signs in and opens Tasks', async () => {
    auth.login.mockResolvedValue(undefined);

    await submitWith('me@flux.test', 'secret');

    expect(auth.login).toHaveBeenCalledWith('me@flux.test', 'secret');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/tabs/tasks', {
      replaceUrl: true,
    });
  });

  it("shows the server's message", async () => {
    auth.login.mockRejectedValue(
      new ApiError(423, {
        code: 'ACCOUNT_LOGIN_LOCKED',
        message: 'Your account is temporarily locked.',
      })
    );

    await submitWith('me@flux.test', 'wrong');

    expect(text()).toContain('Your account is temporarily locked.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows a fallback when the backend is unreachable', async () => {
    auth.login.mockRejectedValue(new ApiError(0));

    await submitWith('me@flux.test', 'secret');

    expect(text()).toContain("Can't reach Flux");
  });

  it('explains why the previous session ended', () => {
    auth.endedMessage.set('Your session was revoked.');
    fixture.detectChanges();

    expect(text()).toContain('Your session was revoked.');
  });

  it('does not submit an invalid form', async () => {
    await submitWith('not-an-email', '');

    expect(auth.login).not.toHaveBeenCalled();
  });
});
