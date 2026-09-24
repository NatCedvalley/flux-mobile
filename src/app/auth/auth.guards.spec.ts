import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { authGuard, guestGuard } from './auth.guards';
import { AuthService } from './auth.service';

describe('auth guards', () => {
  let signedIn: boolean;

  beforeEach(() => {
    signedIn = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            restore: vi.fn().mockResolvedValue(undefined),
            isSignedIn: () => signedIn,
          },
        },
      ],
    });
  });

  function run(guard: typeof authGuard) {
    return TestBed.runInInjectionContext(() => guard({}, [], {} as never));
  }

  function urlOf(result: unknown): string {
    expect(result).toBeInstanceOf(UrlTree);
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  it('authGuard restores the session before deciding', async () => {
    await run(authGuard);

    expect(TestBed.inject(AuthService).restore).toHaveBeenCalled();
  });

  it('authGuard sends signed-out users to /login', async () => {
    expect(urlOf(await run(authGuard))).toBe('/login');
  });

  it('authGuard lets signed-in users through', async () => {
    signedIn = true;
    expect(await run(authGuard)).toBe(true);
  });

  it('guestGuard lets signed-out users see /login', async () => {
    expect(await run(guestGuard)).toBe(true);
  });

  it('guestGuard sends signed-in users to Tasks', async () => {
    signedIn = true;
    expect(urlOf(await run(guestGuard))).toBe('/tabs/tasks');
  });
});
