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
import { MemoryTokenStore } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { FLUX_API } from './app/providers/flux-api.token';
import { SecureTokenStore } from './app/providers/secure-token-store';
import { TOKEN_STORE } from './app/providers/token-store.token';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withComponentInputBinding()
    ),
    // Swap InMemoryFluxApi for a real HTTP implementation when the backend
    // exposes an OpenAPI spec. Everything else in the app is unaffected.
    { provide: FLUX_API, useFactory: () => new InMemoryFluxApi() },
    // Keychain/Keystore on native. Web keeps tokens in memory only: the
    // secure storage plugin's web fallback is localStorage.
    {
      provide: TOKEN_STORE,
      useFactory: () =>
        Capacitor.isNativePlatform()
          ? new SecureTokenStore()
          : new MemoryTokenStore(),
    },
  ],
});
