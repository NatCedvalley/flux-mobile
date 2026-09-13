import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { FLUX_API } from './app/providers/flux-api.token';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    // Swap InMemoryFluxApi for a real HTTP implementation when the backend
    // exposes an OpenAPI spec. Everything else in the app is unaffected.
    { provide: FLUX_API, useFactory: () => new InMemoryFluxApi() },
  ],
});
