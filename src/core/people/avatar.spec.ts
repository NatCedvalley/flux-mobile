import {
  AVATAR_FILL_COUNT,
  accountAvatar,
  avatarFillIndex,
  initials,
} from './avatar';

describe('initials', () => {
  it('uses the first and last name', () => {
    expect(initials({ firstName: 'ada', lastName: 'Lovelace' })).toBe('AL');
  });

  it('falls back to the first two words of the display name', () => {
    expect(initials({ displayName: 'Grace Brewster Hopper' })).toBe('GB');
  });

  it('uses a lone first or last name when there is no display name', () => {
    expect(initials({ firstName: 'Grace' })).toBe('G');
    expect(initials({ lastName: 'Hopper' })).toBe('H');
  });

  it('falls back to the email', () => {
    expect(initials({ displayName: '  ', email: 'ops@flux.test' })).toBe('O');
  });

  it('shows a placeholder when nothing is known', () => {
    expect(initials({})).toBe('?');
  });
});

describe('avatarFillIndex', () => {
  it('is stable for the same key', () => {
    expect(avatarFillIndex('account-42')).toBe(avatarFillIndex('account-42'));
  });

  it('stays within the fill range', () => {
    for (const key of ['', 'a', 'account-1', 'a-much-longer-account-key']) {
      const index = avatarFillIndex(key);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(AVATAR_FILL_COUNT);
    }
  });

  it('spreads different keys across fills', () => {
    const fills = new Set(
      Array.from({ length: 30 }, (_, i) => avatarFillIndex(`account-${i}`))
    );
    expect(fills.size).toBeGreaterThan(1);
  });
});

describe('accountAvatar', () => {
  it('keys the fill by the account id over the email', () => {
    expect(
      accountAvatar({ id: 'account-1', email: 'ada@flux.test' }).fillIndex
    ).toBe(avatarFillIndex('account-1'));
  });

  it('falls back to the email for the fill', () => {
    expect(accountAvatar({ email: 'ada@flux.test' })).toEqual({
      initials: 'A',
      fillIndex: avatarFillIndex('ada@flux.test'),
    });
  });

  it('copes with an empty account', () => {
    expect(accountAvatar({})).toEqual({
      initials: '?',
      fillIndex: avatarFillIndex(''),
    });
  });
});
