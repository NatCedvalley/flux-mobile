import { InjectionToken } from '@angular/core';
import type { TokenStore } from '@core/auth';

/**
 * Where `src/core/auth` persists the session. `main.ts` provides the
 * Keychain/Keystore-backed `SecureTokenStore` on native builds and an
 * in-memory store on web, where tokens must never reach localStorage.
 */
export const TOKEN_STORE = new InjectionToken<TokenStore>('TOKEN_STORE');
