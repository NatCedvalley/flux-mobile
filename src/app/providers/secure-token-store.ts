import {
  KeychainAccess,
  SecureStorage,
} from '@aparajita/capacitor-secure-storage';
import type { StoredSession, TokenStore } from '@core/auth';

const KEY = 'session';

/**
 * Persists the session in the iOS Keychain or Android Keystore-encrypted
 * storage. Native only: the plugin's web implementation falls back to
 * localStorage, so `main.ts` never uses this class on web.
 */
export class SecureTokenStore implements TokenStore {
  // Keychain items stay readable after the first unlock (for a refresh while
  // the phone is locked) and never migrate to another device via backups.
  private readonly ready = SecureStorage.setDefaultKeychainAccess(
    KeychainAccess.afterFirstUnlockThisDeviceOnly
  );

  async load(): Promise<unknown> {
    await this.ready;
    return SecureStorage.get(KEY, false);
  }

  async save(session: StoredSession): Promise<void> {
    await this.ready;
    await SecureStorage.set(KEY, session, false);
  }

  async clear(): Promise<void> {
    await this.ready;
    await SecureStorage.remove(KEY);
  }
}
