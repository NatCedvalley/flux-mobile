import type { CommentReaction } from '../api';

/**
 * A reaction the app offers: the key the server stores, its glyph, and the
 * name a screen reader says for it.
 */
export type ReactionChoice = { key: string; glyph: string; name: string };

/**
 * flux-web's reactions, in its order (`task-comments.ts`). The server
 * stores the key and accepts any string, so the web's set is the
 * vocabulary.
 */
export const REACTIONS: readonly ReactionChoice[] = [
  { key: 'thumbs_up', glyph: '👍', name: 'Thumbs up' },
  { key: 'thumbs_down', glyph: '👎', name: 'Thumbs down' },
  { key: 'heart', glyph: '❤️', name: 'Heart' },
  { key: 'tada', glyph: '🎉', name: 'Party popper' },
  { key: 'laugh', glyph: '😄', name: 'Laugh' },
  { key: 'confused', glyph: '😕', name: 'Confused' },
  { key: 'eyes', glyph: '👀', name: 'Eyes' },
  { key: 'rocket', glyph: '🚀', name: 'Rocket' },
];

const GLYPHS = new Map(REACTIONS.map((r) => [r.key, r.glyph]));
const NAMES = new Map(REACTIONS.map((r) => [r.key, r.name]));

/** The glyph for a stored reaction key; an unknown value shows as it is. */
export function reactionGlyph(emoji: string | undefined): string {
  return GLYPHS.get(emoji ?? '') ?? emoji ?? '';
}

/** A stored reaction key's spoken name; an unknown key, its words. */
export function reactionName(emoji: string | undefined): string {
  return NAMES.get(emoji ?? '') ?? (emoji ?? '').replace(/_/g, ' ');
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
