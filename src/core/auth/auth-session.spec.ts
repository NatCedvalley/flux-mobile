import type { AuthClient } from './auth-client';
import { ApiError } from './api-error';
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

  beforeEach(() => {
    client = fakeClient();
    store = new MemoryTokenStore();
    session = new AuthSession(
      client as unknown as AuthClient,
      store,
      () => NOW
    );
  });

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
      });
      expect(client.getMe).toHaveBeenCalledWith('a2');
      expect(session.state).toEqual({ isSignedIn: true, account: ACCOUNT });
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

      expect(session.state).toEqual({ isSignedIn: false, account: null });
      expect(client.getMe).not.toHaveBeenCalled();
    });

    it('uses a still-valid access token without refreshing', async () => {
      await store.save(stored(120_000));

      await session.restore();

      expect(client.refresh).not.toHaveBeenCalled();
      expect(client.getMe).toHaveBeenCalledWith('a1');
      expect(session.state).toEqual({ isSignedIn: true, account: ACCOUNT });
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
        new ApiError(401, { code: 'SESSION_EXPIRED' })
      );

      await session.restore();

      expect(session.state.isSignedIn).toBe(false);
      expect(await store.load()).toBeNull();
    });

    it('keeps the session when the refresh fails transiently', async () => {
      await store.save(stored(-1));
      client.refresh.mockRejectedValue(
        new ApiError(503, { code: 'KEYCLOAK_UNAVAILABLE' })
      );

      await session.restore();

      expect(session.state).toEqual({ isSignedIn: true, account: null });
      expect(await store.load()).toEqual(stored(-1));
      expect(client.getMe).not.toHaveBeenCalled();
    });

    it('signs out when /accounts/me returns 401', async () => {
      await store.save(stored(120_000));
      client.getMe.mockRejectedValue(new ApiError(401));

      await session.restore();

      expect(session.state.isSignedIn).toBe(false);
      expect(await store.load()).toBeNull();
    });

    it('keeps the session while offline', async () => {
      await store.save(stored(120_000));
      client.getMe.mockRejectedValue(new ApiError(0));

      await session.restore();

      expect(session.state).toEqual({ isSignedIn: true, account: null });
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
});
