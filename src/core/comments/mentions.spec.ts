import {
  insertMention,
  mentionOptions,
  mentionTrigger,
  mentionedIds,
} from './mentions';

describe('mentionTrigger', () => {
  it('fires for an @ that starts a word', () => {
    expect(mentionTrigger('@', 1)).toBe(true);
    expect(mentionTrigger('hi @', 4)).toBe(true);
    expect(mentionTrigger('hi\n@', 4)).toBe(true);
  });

  it('ignores an @ inside a word, or not just typed', () => {
    expect(mentionTrigger('ada@flux', 4)).toBe(false);
    expect(mentionTrigger('@a', 2)).toBe(false);
    expect(mentionTrigger('', 0)).toBe(false);
  });
});

describe('insertMention', () => {
  it('replaces the typed @ with the mention', () => {
    expect(insertMention('hi @ there', 4, 'Ben Tan')).toEqual({
      text: 'hi @Ben Tan  there',
      caret: 12,
    });
  });

  it('inserts at the caret, spaced from a word before it', () => {
    expect(insertMention('thanks', 6, 'Ben Tan')).toEqual({
      text: 'thanks @Ben Tan ',
      caret: 16,
    });
    expect(insertMention('', 0, 'Ben Tan')).toEqual({
      text: '@Ben Tan ',
      caret: 9,
    });
  });
});

describe('mentionedIds', () => {
  const ben = { id: 'a2', name: 'Ben Tan' };
  const chen = { id: 'a3', name: 'Chen Wei' };

  it('keeps the mentions still in the text, once each', () => {
    expect(mentionedIds('@Ben Tan and @Ben Tan', [ben, ben, chen])).toEqual([
      'a2',
    ]);
  });

  it('drops a mention whose text was deleted', () => {
    expect(mentionedIds('@Ben T', [ben])).toEqual([]);
  });
});

describe('mentionOptions', () => {
  it('lists every named member but the caller, by name', () => {
    const options = mentionOptions(
      [
        { accountId: 'a3', firstName: 'Chen', lastName: 'Wei' },
        { accountId: 'a1', firstName: 'Ada', lastName: 'Rahman' },
        { accountId: 'a2', firstName: 'Ben', lastName: 'Tan' },
        { accountId: 'a4', email: 'bot@flux.test' },
      ],
      'a1'
    );
    expect(options.map((o) => [o.accountId, o.name])).toEqual([
      ['a2', 'Ben Tan'],
      ['a3', 'Chen Wei'],
    ]);
  });
});
