import { registerPlugin } from '@capacitor/core';

/**
 * The app's own Android plugin (`NotificationStatePlugin.java`, registered in
 * `MainActivity`). There is no iOS or web implementation, so call it on
 * Android only.
 */
type NotificationStatePlugin = {
  /** Whether notifications are switched on for the app in the OS settings. */
  check(): Promise<{ enabled: boolean }>;
};

const plugin = registerPlugin<NotificationStatePlugin>('NotificationState');

/** A plain object over the plugin's proxy, so specs can spy on it. */
export const NotificationState: NotificationStatePlugin = {
  check: () => plugin.check(),
};
