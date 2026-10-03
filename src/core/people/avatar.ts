/** The name fields an account or assignee may carry, all optional. */
export type PersonName = {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
};

/** How many avatar fills the design defines (`--flux-avatar-1`…`-6`). */
export const AVATAR_FILL_COUNT = 6;

/**
 * Up to two initials for an avatar: first and last name, else the first two
 * words of the display name (or the lone first/last name), else the email's
 * first letter.
 */
export function initials(person: PersonName): string {
  const first = person.firstName?.trim();
  const last = person.lastName?.trim();
  if (first && last) {
    return (first[0] + last[0]).toUpperCase();
  }
  const words = (person.displayName?.trim() || first || last || '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }
  return (person.email?.trim()[0] ?? '?').toUpperCase();
}

/**
 * Which avatar fill a person gets, from 0 to AVATAR_FILL_COUNT - 1. The same
 * key (an account id) always gets the same fill.
 */
export function avatarFillIndex(key: string): number {
  return stableIndex(key, AVATAR_FILL_COUNT);
}

/** An index from 0 to `count - 1` that is always the same for one key. */
export function stableIndex(key: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % count;
}
