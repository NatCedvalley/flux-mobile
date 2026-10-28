import { Capacitor } from '@capacitor/core';
import type { AppEnvironment } from '../../environments/environment.model';
import { buildInfo } from '../../environments/build-info';
import { environment } from '../../environments/environment';

/**
 * Whether this build can use Firebase: native, and built with the platform's
 * config file (`buildInfo.push`). Push, crash reporting and analytics all
 * stay off without it, and never call their plugins.
 */
export function hasFirebaseConfig(): boolean {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }
  return Capacitor.getPlatform() === 'ios'
    ? buildInfo.push.ios
    : buildInfo.push.android;
}

/**
 * Whether crash reports and usage analytics are sent from this build: one
 * with the Firebase config, in staging or production. A dev build only
 * turns their collection off.
 */
export function firebaseReportingEnabled(): boolean {
  return hasFirebaseConfig() && environmentName() !== 'dev';
}

/**
 * Widened to every environment's name: each build's file narrows it to its
 * own, so comparing it with another name wouldn't compile.
 */
function environmentName(): AppEnvironment['name'] {
  return environment.name;
}
