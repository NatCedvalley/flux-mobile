import type { AuthClient } from './auth-client';
import { ApiError, SESSION_EXPIRED_MESSAGE } from './api-error';
import { AuthSession } from './auth-session';
import { MemoryTokenStore, type StoredSession } from './token-store';

const NOW = 1_800_000_000_000;
const ACCOUNT = { id: 'u1', email: 'me@flux.test' };
const FRESH_TOKENS = {
  accessToken: 'a2',
  refreshToken: 'r2',
  expiresIn: 300,
  tokenType: 'Bearer',
};

function fakeClient() {
  return {
    login: vi.fn().mockResolvedValue(FRESH_TOKENS),
    refresh: vi.fn().mockResolvedValue(FRESH_TOKENS),
    logout: vi.fn().mockResolvedValue(undefined),
    getMe: vi.fn().mockResolvedValue(ACCOUNT),
  };
}

function stored(expiresInMs: number): StoredSession {
  return {
    accessToken: 'a1',
    refreshToken: 'r1',
    accessTokenExpiresAt: NOW + expiresInMs,
  };
}

describe('AuthSession', () => {
  let client: ReturnType<typeof fakeClient>;
  let store: MemoryTokenStore;
  let session: AuthSession;
  let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  let clock: number;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = NOW;
    client = fakeClient();
    store = new MemoryTokenStore();
    sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    session = new AuthSession(
      client as unknown as AuthClient,
      store,
      () => clock,
      sleep,
      () => 1
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function signedInWith(expiresInMs: number): Promise<void> {
    await store.save(stored(expiresInMs));
    await session.restore();
    client.refresh.mockClear();
    client.getMe.mockClear();
  }

  describe('login', () => {
    it('stores the tokens and loads the account', async () => {
      const listener = vi.fn();
      session.onChange(listener);

      await session.login('me@flux.test', 'secret');

      expect(client.login).toHaveBeenCalledWith('me@flux.test', 'secret');
      expect(await store.load()).toEqual({
        accessToken: 'a2',
        refreshToken: 'r2',
        accessTokenExpiresAt: NOW + 300_000,
        account: ACCOUNT,
      });
      expect(client.getMe).toHaveBeenCalledWith('a2');
      expect(session.state).toEqual({
        isSignedIn: true,
        account: ACCOUNT,
        endedMessage: null,
      });
      expect(listener).toHaveBeenCalledWith(session.state);
    });

    it('rejects and stays signed out when the server refuses', async () => {
      client.login.mockRejectedValue(new ApiError(422));

      await expect(session.login('me@flux.test', 'wrong')).rejects.toThrow(
        ApiError
      );
      expect(session.state.isSignedIn).toBe(false);
      expect(await store.load()).toBeNull();
    });
  });

  describe('restore', () => {
    it('is signed out when nothing is stored', async () => {
      await session.restore();

      expect(session.state).toEqual({
        isSignedIn: false,
        account: null,
        endedMessage: null,
      });
      expect(client.getMe).not.toHaveBeenCalled();
    });

    it('uses a still-valid access token without refreshing', async () => {
      await store.save(stored(120_000));

      await session.restore();

      expect(client.refresh).not.toHaveBeenCalled();
      expect(client.getMe).toHaveBeenCalledWith('a1');
      expect(session.state).toMatchObject({
        isSignedIn: true,
        account: ACCOUNT,
      });
    });

    it('refreshes an expired access token and stores the new tokens', async () => {
      await store.save(stored(-1));

      await session.restore();

      expect(client.refresh).toHaveBeenCalledWith('r1');
      expect(client.getMe).toHaveBeenCalledWith('a2');
      expect(await store.load()).toMatchObject({ refreshToken: 'r2' });
      expect(session.state.isSignedIn).toBe(true);
    });

    it('refreshes a token about to expire', async () => {
      await store.save(stored(10_000));

      await session.restore();

      expect(client.refresh).toHaveBeenCalled();
    });

    it('signs out when the server rejects the refresh', async () => {
      await store.save(stored(-1));
      client.refresh.mockRejectedValue(
        new ApiError(401, {
          code: 'SESSION_EXPIRED',
          message: 'Session expired.',
        })
      );

      await session.restore();

      expect(session.state).toMatchObject({
        isSignedIn: false,
        endedMessage: 'Session expired.',
      });
      expect(await store.load()).toBeNull();
    });

    it('keeps the session when the refresh fails transiently', async () => {
      await store.save(stored(-1));
      client.refresh.mockRejectedValue(
        new ApiError(503, { code: 'KEYCLOAK_UNAVAILABLE' })
      );

      await session.restore();

      expect(client.refresh).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(session.state).toMatchObject({ isSignedIn: true, account: null });
      expect(await store.load()).toEqual(stored(-1));
      expect(client.getMe).not.toHaveBeenCalled();
    });

    it('refreshes once, then signs out, when /accounts/me keeps returning 401', async () => {
      await store.save(stored(120_000));
      client.getMe.mockRejectedValue(new ApiError(401));

      await session.restore();

      expect(client.refresh).toHaveBeenCalledTimes(1);
      expect(client.getMe).toHaveBeenCalledTimes(2);
      expect(session.state).toMatchObject({
        isSignedIn: false,
        endedMessage: SESSION_EXPIRED_MESSAGE,
      });
      expect(await store.load()).toBeNull();
    });

    it('keeps the session while offline', async () => {
      await store.save(stored(120_000));
      client.getMe.mockRejectedValue(new ApiError(0));

      await session.restore();

      expect(session.state).toMatchObject({ isSignedIn: true, account: null });
      expect(await store.load()).toEqual(stored(120_000));
    });

    it('signs out and clears the store when loading fails', async () => {
      const clear = vi.spyOn(store, 'clear');
      vi.spyOn(store, 'load').mockRejectedValue(new Error('decrypt failed'));

      await session.restore();

      expect(session.state.isSignedIn).toBe(false);
      expect(clear).toHaveBeenCalled();
    });

    it('ignores malformed stored data', async () => {
      vi.spyOn(store, 'load').mockResolvedValue({ accessToken: 42 } as never);

      await session.restore();

      expect(session.state.isSignedIn).toBe(false);
      expect(client.getMe).not.toHaveBeenCalled();
    });
  });

  describe('proactive refresh', () => {
    it('refreshes 30 s before the access token expires', async () => {
      await signedInWith(120_000);

      await vi.advanceTimersByTimeAsync(89_999);
      expect(client.refresh).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(client.refresh).toHaveBeenCalledWith('r1');
      expect(await store.load()).toMatchObject({ accessToken: 'a2' });
    });

    it('stops once the session ends', async () => {
      await signedInWith(120_000);
      await session.logout();

      await vi.advanceTimersByTimeAsync(120_000);

      expect(client.refresh).not.toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('refreshes a token that expired while suspended', async () => {
      await signedInWith(120_000);
      clock = NOW + 100_000;

      await session.resume();

      expect(client.refresh).toHaveBeenCalledWith('r1');
    });

    it('otherwise reschedules the proactive refresh', async () => {
      await signedInWith(120_000);
      clock = NOW + 10_000;

      await session.resume();
      expect(client.refresh).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(80_000);
      expect(client.refresh).toHaveBeenCalled();
    });

    it('does nothing when signed out', async () => {
      await session.resume();

      expect(client.refresh).not.toHaveBeenCalled();
    });
  });

  describe('withAccessToken', () => {
    it('passes the access token to the call', async () => {
      await signedInWith(120_000);

      await expect(session.withAccessToken(async (t) => t)).resolves.toBe('a1');
    });

    it('refreshes first when the token is about to expire', async () => {
      await signedInWith(120_000);
      clock = NOW + 95_000;

      await expect(session.withAccessToken(async (t) => t)).resolves.toBe('a2');
      expect(client.refresh).toHaveBeenCalledTimes(1);
    });

    it('shares one refresh among concurrent 401s and retries each call', async () => {
      await signedInWith(120_000);
      let finishRefresh!: () => void;
      client.refresh.mockReturnValue(
        new Promise((resolve) => {
          finishRefresh = () => resolve(FRESH_TOKENS);
        })
      );
      const call = vi.fn(async (token: string) => {
        if (token === 'a1') {
          throw new ApiError(401);
        }
        return token;
      });

      const results = Promise.all([
        session.withAccessToken(call),
        session.withAccessToken(call),
        session.withAccessToken(call),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      finishRefresh();

      await expect(results).resolves.toEqual(['a2', 'a2', 'a2']);
      expect(client.refresh).toHaveBeenCalledTimes(1);
      expect(call).toHaveBeenCalledTimes(6);
    });

    it('ends the session when the retry is also rejected', async () => {
      await signedInWith(120_000);
      const call = vi.fn().mockRejectedValue(new ApiError(401));

      await expect(session.withAccessToken(call)).rejects.toThrow(ApiError);

      expect(client.refresh).toHaveBeenCalledTimes(1);
      expect(call).toHaveBeenCalledTimes(2);
      expect(session.state).toMatchObject({
        isSignedIn: false,
        endedMessage: SESSION_EXPIRED_MESSAGE,
      });
      expect(await store.load()).toBeNull();
    });

    it.each([
      [401, 'TOKEN_REVOKED'],
      [401, 'SESSION_EXPIRED'],
      [403, 'ACCOUNT_SUSPENDED'],
      [423, 'ACCOUNT_LOCKED'],
    ])(
      "ends the session on %i %s with the server's message",
      async (status, code) => {
        await signedInWith(120_000);
        const error = new ApiError(status, { code, message: `${code}!` });

        await expect(
          session.withAccessToken(() => Promise.reject(error))
        ).rejects.toBe(error);

        expect(client.refresh).not.toHaveBeenCalled();
        expect(session.state).toMatchObject({
          isSignedIn: false,
          endedMessage: `${code}!`,
        });
        expect(await store.load()).toBeNull();
      }
    );

    it('falls back to the generic message', async () => {
      await signedInWith(120_000);

      await expect(
        session.withAccessToken(() =>
          Promise.reject(new ApiError(401, { code: 'TOKEN_REVOKED' }))
        )
      ).rejects.toThrow();

      expect(session.state.endedMessage).toBe(SESSION_EXPIRED_MESSAGE);
    });

    it.each([
      ['a permission error', new ApiError(403, { code: 'ACCESS_DENIED' })],
      ['a server error', new ApiError(503, { code: 'KEYCLOAK_UNAVAILABLE' })],
      ['no response', new ApiError(0)],
    ])('keeps the session on %s', async (_, error) => {
      await signedInWith(120_000);

      await expect(
        session.withAccessToken(() => Promise.reject(error))
      ).rejects.toBe(error);

      expect(client.refresh).not.toHaveBeenCalled();
      expect(session.state.isSignedIn).toBe(true);
      expect(await store.load()).toEqual({
        ...stored(120_000),
        account: ACCOUNT,
      });
    });

    it('rejects without calling when signed out', async () => {
      const call = vi.fn();

      await expect(session.withAccessToken(call)).rejects.toMatchObject({
        status: 401,
      });
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('refresh backoff', () => {
    it('retries a transient refresh failure with growing delays', async () => {
      await signedInWith(120_000);
      clock = NOW + 95_000;
      client.refresh
        .mockRejectedValueOnce(new ApiError(0))
        .mockRejectedValueOnce(new ApiError(503))
        .mockResolvedValue(FRESH_TOKENS);

      await expect(session.withAccessToken(async (t) => t)).resolves.toBe('a2');

      expect(client.refresh).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls).toEqual([[2_000], [4_000]]);
    });

    it('gives up after 3 retries and keeps the tokens', async () => {
      await signedInWith(120_000);
      clock = NOW + 95_000;
      client.refresh.mockRejectedValue(new ApiError(503));
      const call = vi.fn();

      await expect(session.withAccessToken(call)).rejects.toMatchObject({
        status: 503,
      });

      expect(client.refresh).toHaveBeenCalledTimes(4);
      expect(sleep.mock.calls).toEqual([[2_000], [4_000], [8_000]]);
      expect(call).not.toHaveBeenCalled();
      expect(session.state.isSignedIn).toBe(true);
      expect(await store.load()).toEqual({
        ...stored(120_000),
        account: ACCOUNT,
      });
    });

    it('ends the session when the refresh is rejected', async () => {
      await signedInWith(120_000);
      clock = NOW + 95_000;
      client.refresh.mockRejectedValue(new ApiError(400));

      await expect(session.withAccessToken(async (t) => t)).rejects.toThrow();

      expect(sleep).not.toHaveBeenCalled();
      expect(session.state).toMatchObject({
        isSignedIn: false,
        endedMessage: SESSION_EXPIRED_MESSAGE,
      });
    });
  });

  describe('logout', () => {
    it('ends the session on the server, then clears it locally', async () => {
      await signedInWith(120_000);

      await session.logout();

      expect(client.refresh).not.toHaveBeenCalled();
      expect(client.logout).toHaveBeenCalledWith('a1', 'r1');
      expect(session.state).toEqual({
        isSignedIn: false,
        account: null,
        endedMessage: null,
      });
      expect(await store.load()).toBeNull();
    });

    it('refreshes an expired token first, then logs out, then clears', async () => {
      await signedInWith(120_000);
      clock = NOW + 100_000;
      const order: string[] = [];
      client.refresh.mockImplementation(async () => {
        order.push('refresh');
        return FRESH_TOKENS;
      });
      client.logout.mockImplementation(async () => {
        order.push('logout');
      });
      const clear = store.clear.bind(store);
      vi.spyOn(store, 'clear').mockImplementation(async () => {
        order.push('clear');
        await clear();
      });

      await session.logout();

      expect(order).toEqual(['refresh', 'logout', 'clear']);
      expect(client.logout).toHaveBeenCalledWith('a2', 'r2');
    });

    it.each([
      ['the server call fails', () => new ApiError(502)],
      ['offline', () => new ApiError(0)],
    ])('still clears locally when %s', async (_, error) => {
      await signedInWith(120_000);
      client.logout.mockRejectedValue(error());

      await session.logout();

      expect(session.state.isSignedIn).toBe(false);
      expect(session.state.endedMessage).toBeNull();
      expect(await store.load()).toBeNull();
    });

    it('runs the before-logout hook after the refresh, before the server logout', async () => {
      await signedInWith(120_000);
      clock = NOW + 100_000;
      const order: string[] = [];
      client.refresh.mockImplementation(async () => {
        order.push('refresh');
        return FRESH_TOKENS;
      });
      client.logout.mockImplementation(async () => {
        order.push('logout');
      });
      session.setBeforeLogout(async () => {
        order.push('hook');
        expect(session.state.isSignedIn).toBe(true);
      });

      await session.logout();

      expect(order).toEqual(['refresh', 'hook', 'logout']);
    });

    it('still logs out when the before-logout hook rejects', async () => {
      await signedInWith(120_000);
      session.setBeforeLogout(() => Promise.reject(new ApiError(0)));

      await session.logout();

      expect(client.logout).toHaveBeenCalledWith('a1', 'r1');
      expect(session.state.isSignedIn).toBe(false);
      expect(await store.load()).toBeNull();
    });

    it('skips the before-logout hook without a live token', async () => {
      const hook = vi.fn().mockResolvedValue(undefined);
      session.setBeforeLogout(hook);

      await session.logout();
      expect(hook).not.toHaveBeenCalled();

      await signedInWith(120_000);
      clock = NOW + 100_000;
      client.refresh.mockRejectedValue(new ApiError(0));

      await session.logout();
      expect(hook).not.toHaveBeenCalled();
    });

    it('clears without calling the server when the refresh fails', async () => {
      await signedInWith(120_000);
      clock = NOW + 100_000;
      client.refresh.mockRejectedValue(new ApiError(0));

      await session.logout();

      expect(client.refresh).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(client.logout).not.toHaveBeenCalled();
      expect(session.state.isSignedIn).toBe(false);
      expect(await store.load()).toBeNull();
    });
  });

  describe('stored account', () => {
    const SAVED = { id: 'u1', email: 'old@flux.test' };

    it('restores offline from the store without calling the server', async () => {
      await store.save({ ...stored(-1), account: SAVED });
      const listener = vi.fn();
      session.onChange(listener);

      await session.restore({ offline: true });

      expect(client.refresh).not.toHaveBeenCalled();
      expect(client.getMe).not.toHaveBeenCalled();
      expect(session.state).toMatchObject({ isSignedIn: true, account: SAVED });
      expect(listener).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(600_000);
      expect(client.refresh).not.toHaveBeenCalled();
    });

    it('restores offline without an account stored by an older version', async () => {
      await store.save(stored(120_000));

      await session.restore({ offline: true });

      expect(session.state).toMatchObject({ isSignedIn: true, account: null });
      expect(client.getMe).not.toHaveBeenCalled();
    });

    it('falls back to the stored account when the refresh fails transiently', async () => {
      await store.save({ ...stored(-1), account: SAVED });
      client.refresh.mockRejectedValue(new ApiError(0));

      await session.restore();

      expect(session.state).toMatchObject({ isSignedIn: true, account: SAVED });
    });

    it('falls back to the stored account when /accounts/me fails transiently', async () => {
      await store.save({ ...stored(120_000), account: SAVED });
      client.getMe.mockRejectedValue(new ApiError(503));

      await session.restore();

      expect(session.state).toMatchObject({ isSignedIn: true, account: SAVED });
    });

    it('replaces the stored account once /accounts/me answers', async () => {
      await store.save({ ...stored(120_000), account: SAVED });

      await session.restore();

      expect(session.state.account).toEqual(ACCOUNT);
      expect(await store.load()).toMatchObject({ account: ACCOUNT });
    });

    it('keeps the account through a refresh', async () => {
      await signedInWith(120_000);
      clock = NOW + 95_000;

      await session.withAccessToken(async () => undefined);

      expect(await store.load()).toMatchObject({
        accessToken: 'a2',
        account: ACCOUNT,
      });
    });

    it('fetches a restored account again on resume, once', async () => {
      await store.save({ ...stored(-1), account: SAVED });
      await session.restore({ offline: true });

      await session.resume();
      await session.resume();

      expect(client.refresh).toHaveBeenCalledTimes(1);
      expect(client.getMe).toHaveBeenCalledTimes(1);
      expect(session.state.account).toEqual(ACCOUNT);
    });

    it('waits to fetch the account until the refresh succeeds', async () => {
      await store.save({ ...stored(-1), account: SAVED });
      await session.restore({ offline: true });
      client.refresh.mockRejectedValue(new ApiError(0));

      await session.resume();

      expect(client.getMe).not.toHaveBeenCalled();
      expect(session.state.account).toEqual(SAVED);
    });

    it('keeps the account when saving it fails', async () => {
      await store.save(stored(120_000));
      vi.spyOn(store, 'save').mockRejectedValue(new Error('keychain'));

      await session.restore();

      expect(session.state).toMatchObject({
        isSignedIn: true,
        account: ACCOUNT,
      });
    });
  });
});
