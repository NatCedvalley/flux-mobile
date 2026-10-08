import { REACTIONS, reactionGlyph, reactionToggles } from './reactions';

describe('reactionGlyph', () => {
  it('maps the stored key to its glyph', () => {
    expect(reactionGlyph('thumbs_up')).toBe('👍');
    expect(reactionGlyph('rocket')).toBe('🚀');
  });

  it('shows an unknown value as it is', () => {
    expect(reactionGlyph('🦄')).toBe('🦄');
    expect(reactionGlyph(undefined)).toBe('');
  });

  it('offers the web’s eight reactions', () => {
    expect(REACTIONS.map((r) => r.key)).toEqual([
      'thumbs_up',
      'thumbs_down',
      'heart',
      'tada',
      'laugh',
      'confused',
      'eyes',
      'rocket',
    ]);
  });
});

describe('reactionToggles', () => {
  const reactions = [
    { emoji: 'thumbs_up', count: 2, reactedByMe: true },
    { emoji: 'eyes', count: 1, reactedByMe: false },
  ];

  it('toggles the reaction alone when the caller has none', () => {
    expect(reactionToggles([], 'heart')).toEqual(['heart']);
    expect(reactionToggles(undefined, 'heart')).toEqual(['heart']);
  });

  it('takes the caller’s own off', () => {
    expect(reactionToggles(reactions, 'thumbs_up')).toEqual(['thumbs_up']);
  });

  it('swaps a different one of the caller’s first', () => {
    expect(reactionToggles(reactions, 'eyes')).toEqual(['thumbs_up', 'eyes']);
  });
});
