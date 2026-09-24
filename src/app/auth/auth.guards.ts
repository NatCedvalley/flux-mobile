import { inject } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Both guards read `isSignedIn()` after awaiting `restore()`, not the result
// of the memoized restore, which is stale once the user signs in.

/** Keeps signed-out users on the login page. */
export const authGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.restore();
  return auth.isSignedIn() || router.parseUrl('/login');
};

/** Sends signed-in users past the login page. */
export const guestGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.restore();
  return !auth.isSignedIn() || router.parseUrl('/tabs/tasks');
};
