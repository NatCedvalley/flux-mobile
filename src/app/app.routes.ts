import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth/auth.guards';

export const routes: Routes = [
  // Must come before '', which prefix-matches every URL: behind authGuard,
  // /login would otherwise redirect to itself.
  {
    path: 'login',
    canMatch: [guestGuard],
    loadComponent: () =>
      import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canMatch: [authGuard],
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
];
