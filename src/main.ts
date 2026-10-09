import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { HttpFluxApi } from '@core/api';
import { MemoryTokenStore } from '@core/auth';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AuthService } from './app/auth/auth.service';
import { BackButtonService } from './app/back-button/back-button.service';
import { registerFluxIcons } from './app/icons/register-icons';
import { AppLockService } from './app/lock/app-lock.service';
import { FLUX_API } from './app/providers/flux-api.token';
import { SecureTokenStore } from './app/providers/secure-token-store';
import { TOKEN_STORE } from './app/providers/token-store.token';
import { StatusBarService } from './app/status-bar/status-bar.service';
import { environment } from './environments/environment';

registerFluxIcons();

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // iOS geometry for sheets, segments and items on both platforms, as the
    // design handoff requires. It also enables swipe-back on every stack.
    // `useSetInputAPI` hands a controller-made modal's `componentProps` to
    // its signal inputs (the create sheet's).
    provideIonicAngular({ mode: 'ios', useSetInputAPI: true }),
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withComponentInputBinding()
    ),
    // flux-operations, with every call made through the session's token.
    {
      provide: FLUX_API,
      useFactory: () => {
        const auth = inject(AuthService);
        return new HttpFluxApi(environment.apiBaseUrl, (call) =>
          auth.withAccessToken(call)
        );
      },
    },
    // Keychain/Keystore on native. Web keeps tokens in memory only: the
    // secure storage plugin's web fallback is localStorage.
    {
      provide: TOKEN_STORE,
      useFactory: () =>
        Capacitor.isNativePlatform()
          ? new SecureTokenStore()
          : new MemoryTokenStore(),
    },
    // Decides whether a cold start is locked before the first route renders.
    provideAppInitializer(() => inject(AppLockService).init()),
    provideAppInitializer(() => inject(StatusBarService).init()),
    provideAppInitializer(() => inject(BackButtonService).init()),
  ],
});
