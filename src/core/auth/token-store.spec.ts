import {
  MemoryTokenStore,
  isStoredSession,
  storedAccount,
} from './token-store';

const SESSION = {
  accessToken: 'a',
  refreshToken: 'r',
  accessTokenExpiresAt: 1,
};

describe('MemoryTokenStore', () => {
  it('saves, loads and clears a session', async () => {
    const store = new MemoryTokenStore();
    expect(await store.load()).toBeNull();

    await store.save(SESSION);
    expect(await store.load()).toEqual(SESSION);

    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

describe('isStoredSession', () => {
  it('accepts a complete session', () => {
    expect(isStoredSession(SESSION)).toBe(true);
  });

  it.each([null, 'token', {}, { ...SESSION, accessTokenExpiresAt: '1' }])(
    'rejects %j',
    (value) => {
      expect(isStoredSession(value)).toBe(false);
    }
  );
});

describe('storedAccount', () => {
  it('returns a stored account', () => {
    const account = { id: 'u1', email: 'me@flux.test' };
    expect(storedAccount({ ...SESSION, account })).toBe(account);
  });

  it.each([undefined, null, 'u1', { email: 'me@flux.test' }])(
    'ignores %j',
    (account) => {
      expect(storedAccount({ ...SESSION, account } as never)).toBeNull();
    }
  );
});
