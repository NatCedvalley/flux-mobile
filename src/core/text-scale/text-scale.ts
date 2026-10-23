/** The OS text size the app follows: never smaller than the design, at most 120%. */
export const MIN_TEXT_SCALE = 1;
export const MAX_TEXT_SCALE = 1.2;

/**
 * The text scale to apply for the OS's preferred one (1 = the default
 * size), clamped to [MIN_TEXT_SCALE, MAX_TEXT_SCALE] and rounded to two
 * decimals. Anything that isn't a finite number reads as 1.
 */
export function textScale(preferred: number): number {
  if (!Number.isFinite(preferred)) {
    return MIN_TEXT_SCALE;
  }
  const clamped = Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, preferred));
  return Math.round(clamped * 100) / 100;
}
