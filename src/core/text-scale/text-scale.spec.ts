import { MAX_TEXT_SCALE, MIN_TEXT_SCALE, textScale } from './text-scale';

describe('textScale', () => {
  it('keeps the default size', () => {
    expect(textScale(1)).toBe(1);
  });

  it('never goes below the design size', () => {
    expect(textScale(0.82)).toBe(MIN_TEXT_SCALE);
  });

  it('follows a size between the limits', () => {
    expect(textScale(1.12)).toBe(1.12);
  });

  it('stops at 120%', () => {
    expect(textScale(23 / 17)).toBe(MAX_TEXT_SCALE);
    expect(textScale(2)).toBe(MAX_TEXT_SCALE);
  });

  it('rounds to two decimals', () => {
    expect(textScale(1.1176470588)).toBe(1.12);
  });

  it('reads a value that is not a number as the default', () => {
    expect(textScale(Number.NaN)).toBe(1);
    expect(textScale(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
