// Public surface of the comment writing rules. Import from '@core/comments'.
export {
  insertMention,
  mentionedIds,
  mentionOptions,
  mentionTrigger,
  type Mention,
  type MentionInsert,
  type MentionOption,
} from './mentions';
export {
  REACTIONS,
  reactionGlyph,
  reactionToggles,
  type ReactionChoice,
} from './reactions';
export { canEditComment, withComment, withoutComment } from './thread';
