import type { CommentReaction } from '../api';

/** A reaction the app offers: the key the server stores, and its glyph. */
export type ReactionChoice = { key: string; glyph: string };

/**
 * flux-web's reactions, in its order (`task-comments.ts`). The server
 * stores the key and accepts any string, so the web's set is the
 * vocabulary.
 */
export const REACTIONS: readonly ReactionChoice[] = [
  { key: 'thumbs_up', glyph: '👍' },
  { key: 'thumbs_down', glyph: '👎' },
  { key: 'heart', glyph: '❤️' },
  { key: 'tada', glyph: '🎉' },
  { key: 'laugh', glyph: '😄' },
  { key: 'confused', glyph: '😕' },
  { key: 'eyes', glyph: '👀' },
  { key: 'rocket', glyph: '🚀' },
];

const GLYPHS = new Map(REACTIONS.map((r) => [r.key, r.glyph]));

/** The glyph for a stored reaction key; an unknown value shows as it is. */
export function reactionGlyph(emoji: string | undefined): string {
  return GLYPHS.get(emoji ?? '') ?? emoji ?? '';
}

/**
 * The reactions to toggle, in order, for the caller picking `key`. The web
 * keeps one reaction per person (the server would allow several), so a
 * different reaction of the caller's is taken off first. Picking their own
 * removes it.
 */
export function reactionToggles(
  reactions: readonly CommentReaction[] | undefined,
  key: string
): string[] {
  const mine = reactions?.find((r) => r.reactedByMe)?.emoji;
  return mine && mine !== key ? [mine, key] : [key];
}
