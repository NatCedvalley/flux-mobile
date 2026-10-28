import { Capacitor } from '@capacitor/core';
import { buildInfo } from '../../environments/build-info';

/**
 * Whether this build can use Firebase: native, and built with the platform's
 * config file (`buildInfo.push`). Push and crash reporting both stay off
 * without it, and never call their plugins.
 */
export function hasFirebaseConfig(): boolean {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }
  return Capacitor.getPlatform() === 'ios'
    ? buildInfo.push.ios
    : buildInfo.push.android;
}
