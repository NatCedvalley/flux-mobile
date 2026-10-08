import type { TaskComment } from '../api';
import { isEditorJsJson } from '../rich-text';

/**
 * The thread with comment `id` changed by `change`, whether it is a
 * top-level comment or a reply. Other comments are kept as they are.
 */
export function withComment(
  thread: readonly TaskComment[],
  id: string,
  change: (comment: TaskComment) => TaskComment
): TaskComment[] {
  return thread.map((comment) => {
    if (comment.id === id) {
      return change(comment);
    }
    if (comment.replies?.some((reply) => reply.id === id)) {
      return {
        ...comment,
        replies: comment.replies.map((r) => (r.id === id ? change(r) : r)),
      };
    }
    return comment;
  });
}

/** The thread without comment `id`, whether top-level or a reply. */
export function withoutComment(
  thread: readonly TaskComment[],
  id: string
): TaskComment[] {
  return thread
    .filter((comment) => comment.id !== id)
    .map((comment) =>
      comment.replies?.some((reply) => reply.id === id)
        ? { ...comment, replies: comment.replies.filter((r) => r.id !== id) }
        : comment
    );
}

/**
 * Whether the app may edit the comment's body: it writes Markdown, so only
 * a Markdown one. Older rows hold Editor.js JSON under MARKDOWN, so the
 * content is checked too.
 */
export function canEditComment(comment: TaskComment): boolean {
  return (
    (comment.bodyFormat ?? 'MARKDOWN') === 'MARKDOWN' &&
    !isEditorJsJson(comment.body)
  );
}
