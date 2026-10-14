import type { DevicePlatform, FluxApi } from '../api';

/** The server's limit on `appVersion`. */
const APP_VERSION_MAX = 32;

type DeviceApi = Pick<FluxApi, 'registerDevice' | 'unregisterDevice'>;

/**
 * Keeps this device's push token registered to whoever is signed in.
 * Framework-agnostic; src/app feeds it the token and the account.
 *
 * It registers once a token and an account are both known, and again when
 * either changes: the server moves a token to whoever registers it last.
 * Every launch registers once, which also retries a registration that
 * failed. Calls run one at a time, in order, so an unregister can't
 * overtake a register.
 */
export class PushRegistration {
  private token: string | null = null;
  private accountId: string | null = null;
  /** The account and token registered in this launch. */
  private registered: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly appVersion: string;

  constructor(
    private readonly api: DeviceApi,
    private readonly platform: DevicePlatform,
    appVersion: string
  ) {
    this.appVersion = appVersion.slice(0, APP_VERSION_MAX);
  }

  /** The token FCM gave this device, first or after a refresh. */
  setToken(token: string): Promise<void> {
    this.token = token;
    return this.sync();
  }

  /** The signed-in account, or null when signed out. */
  setAccount(accountId: string | null): Promise<void> {
    this.accountId = accountId;
    return this.sync();
  }

  /**
   * Takes the token off the signed-in account, so a signed-out phone stops
   * getting its pushes. Needs a live access token, so it runs before the
   * logout. Never rejects: a token the server doesn't know (404) or no
   * response mustn't block the logout.
   */
  unregister(): Promise<void> {
    return this.enqueue(async () => {
      const token = this.token;
      this.registered = null;
      if (!token) {
        return;
      }
      try {
        await this.api.unregisterDevice(token);
      } catch {
        // The server prunes tokens FCM rejects, and the next sign-in on this
        // phone moves the token to that account.
      }
    });
  }

  private sync(): Promise<void> {
    return this.enqueue(async () => {
      const { token, accountId } = this;
      if (!token || !accountId) {
        return;
      }
      const key = `${accountId} ${token}`;
      if (key === this.registered) {
        return;
      }
      try {
        await this.api.registerDevice({
          token,
          platform: this.platform,
          appVersion: this.appVersion,
        });
        this.registered = key;
      } catch {
        // Retried on the next token, account or launch.
      }
    });
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task);
    return this.queue;
  }
}
