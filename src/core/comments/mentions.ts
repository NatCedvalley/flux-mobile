import type { ProjectMember } from '../api';

/** A mention typed into a comment: who, and the name the text shows. */
export type Mention = { id: string; name: string };

/** The text and caret after inserting a mention. */
export type MentionInsert = { text: string; caret: number };

/**
 * Whether the character just typed (the one before `caret`) is an `@` that
 * starts a mention: at the start of the text or after whitespace, so an
 * email address doesn't open the picker.
 */
export function mentionTrigger(text: string, caret: number): boolean {
  return text[caret - 1] === '@' && (caret === 1 || /\s/.test(text[caret - 2]));
}

/**
 * Inserts `@name ` at `caret`. A trigger `@` just before the caret is
 * replaced rather than doubled, and a space is added before the mention
 * when it would touch a word.
 */
export function insertMention(
  text: string,
  caret: number,
  name: string
): MentionInsert {
  const start = mentionTrigger(text, caret) ? caret - 1 : caret;
  const before = text.slice(0, start);
  const gap = before && !/\s$/.test(before) ? ' ' : '';
  const inserted = `${gap}@${name} `;
  return {
    text: before + inserted + text.slice(caret),
    caret: start + inserted.length,
  };
}

/**
 * The accounts still mentioned in `text`, once each: a mention whose
 * `@name` was deleted from the text no longer counts.
 */
export function mentionedIds(
  text: string,
  mentions: readonly Mention[]
): string[] {
  const ids = mentions
    .filter((m) => text.includes(`@${m.name}`))
    .map((m) => m.id);
  return [...new Set(ids)];
}

/** A member the mention picker lists. */
export type MentionOption = {
  accountId: string;
  name: string;
  member: ProjectMember;
};

/**
 * The mention picker's rows: every member but the caller (the server
 * doesn't notify the author), by name. A member with no name is left out,
 * since the mention would have nothing to show.
 */
export function mentionOptions(
  members: readonly ProjectMember[],
  myAccountId: string | undefined
): MentionOption[] {
  return members
    .map((member) => ({
      accountId: member.accountId ?? '',
      name: [member.firstName, member.lastName].filter(Boolean).join(' '),
      member,
    }))
    .filter((o) => o.accountId && o.name && o.accountId !== myAccountId)
    .sort((a, b) => a.name.localeCompare(b.name));
}
