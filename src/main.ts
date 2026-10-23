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
import { CachingFluxApi, MemoryCacheStore } from '@core/offline';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AuthService } from './app/auth/auth.service';
import { BackButtonService } from './app/back-button/back-button.service';
import { registerFluxIcons } from './app/icons/register-icons';
import { InboxService } from './app/inbox/inbox.service';
import { AppLockService } from './app/lock/app-lock.service';
import { ConnectivityService } from './app/offline/connectivity.service';
import { QueueReplayService } from './app/offline/queue-replay.service';
import { ReadCacheService } from './app/offline/read-cache.service';
import { WriteQueueService } from './app/offline/write-queue.service';
import { CACHE_STORE } from './app/providers/cache-store.token';
import { FileCacheStore } from './app/providers/file-cache-store';
import { FLUX_API } from './app/providers/flux-api.token';
import { NETWORK_FLUX_API } from './app/providers/network-flux-api.token';
import { PreferencesStore } from './app/providers/preferences-store';
import { SecureTokenStore } from './app/providers/secure-token-store';
import { TOKEN_STORE } from './app/providers/token-store.token';
import { WRITE_QUEUE_STORE } from './app/providers/write-queue-store.token';
import { PushOpenService } from './app/push/push-open.service';
import { PushService } from './app/push/push.service';
import { StatusBarService } from './app/status-bar/status-bar.service';
import { TextScaleService } from './app/text-scale/text-scale.service';
import { ThemeService } from './app/theme/theme.service';
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
      provide: NETWORK_FLUX_API,
      useFactory: () => {
        const auth = inject(AuthService);
        return new HttpFluxApi(environment.apiBaseUrl, (call) =>
          auth.withAccessToken(call)
        );
      },
    },
    // The same, with the reads the screens last loaded served from the cache
    // offline, and the statuses changed offline shown on the tasks read.
    {
      provide: FLUX_API,
      useFactory: () => {
        const auth = inject(AuthService);
        const connectivity = inject(ConnectivityService);
        const { queue } = inject(WriteQueueService);
        return new CachingFluxApi(
          inject(NETWORK_FLUX_API),
          inject(ReadCacheService).cache,
          {
            accountId: () => auth.account()?.id,
            online: () => connectivity.online(),
            queuedStatus: (taskId) => queue.queuedStatus(taskId),
          }
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
    // App-private files on native, so the cache survives the app being
    // killed. Web keeps it in memory, like the tokens.
    {
      provide: CACHE_STORE,
      useFactory: () =>
        Capacitor.isNativePlatform()
          ? new FileCacheStore()
          : new MemoryCacheStore(),
    },
    // Preferences on native, which the OS never purges (unlike the Cache
    // directory). Web keeps the queue in memory, like the tokens.
    {
      provide: WRITE_QUEUE_STORE,
      useFactory: () =>
        Capacitor.isNativePlatform()
          ? new PreferencesStore()
          : new MemoryCacheStore(),
    },
    // Applies Settings' theme before the first route renders.
    provideAppInitializer(() => inject(ThemeService).init()),
    // Follows the OS text size (up to 120%) before the first route renders.
    provideAppInitializer(() => inject(TextScaleService).init()),
    // Decides whether a cold start is locked before the first route renders.
    provideAppInitializer(() => inject(AppLockService).init()),
    // Awaited, so a cold start that's already offline shows it at once.
    provideAppInitializer(() => inject(ConnectivityService).init()),
    provideAppInitializer(() => inject(StatusBarService).init()),
    provideAppInitializer(() => inject(BackButtonService).init()),
    // Not awaited: push setup mustn't hold up the first screen.
    provideAppInitializer(() => void inject(PushService).init()),
    // Listens for push taps here, so a cold start's tap isn't lost.
    provideAppInitializer(() => inject(PushOpenService).init()),
    // The Inbox tab's badge: unread counts, kept for the signed-in account.
    provideAppInitializer(() => inject(InboxService).init()),
    // Wipes the read cache whenever no one is signed in.
    provideAppInitializer(() => inject(ReadCacheService).init()),
    // The signed-in account's status changes made offline, sent once online.
    provideAppInitializer(() => inject(WriteQueueService).init()),
    provideAppInitializer(() => inject(QueueReplayService).init()),
  ],
});
