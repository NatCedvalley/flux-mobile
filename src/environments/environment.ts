// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.staging.ts` or
// `environment.prod.ts`. The list of file replacements can be found in
// `angular.json`.

import type { AppEnvironment } from './environment.model';

// An Android emulator or USB-connected phone reaches these `localhost` URLs
// once the ports are forwarded with `adb reverse` (see CLAUDE.md §5); the iOS
// simulator shares the Mac's localhost. Debug builds allow the cleartext http.
export const environment = {
  name: 'dev',
  production: false,
  apiBaseUrl: 'http://localhost:9003/api/v1',
  iamBaseUrl: 'http://localhost:9001/api/v1',
  notificationWsUrl: 'http://localhost:9005/ws',
} satisfies AppEnvironment;

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
