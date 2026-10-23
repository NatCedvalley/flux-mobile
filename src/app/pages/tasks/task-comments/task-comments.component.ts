import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import type { CommentReaction, TaskComment } from '@core/api';
import type { QueuedComment } from '@core/offline';
import { reactionGlyph, reactionName } from '@core/comments';
import { avatarFillIndex, initials } from '@core/people';
import { relativeTime } from '@core/task-detail';
import { RichTextComponent } from '../../../shared/rich-text/rich-text.component';

/** A reaction tapped on a comment: its key, toggled for the caller. */
export type CommentReact = { comment: TaskComment; emoji: string };

/**
 * The Comments tab's thread (3f): oldest first, each top-level comment
 * followed by its replies, with reactions. With `canReact`, a pill toggles
 * that reaction and the add button asks for the reaction sheet; with
 * `canWrite`, the caller's own comments get a ⋯ for Edit and Delete.
 * After the thread come the caller's comments still in the write queue:
 * waiting for a connection, or refused by the server with Copy text and
 * Delete. The page does the writing.
 */
@Component({
  selector: 'app-task-comments',
  templateUrl: './task-comments.component.html',
  styleUrls: ['./task-comments.component.scss'],
  imports: [NgTemplateOutlet, IonIcon, RichTextComponent],
})
export class TaskCommentsComponent {
  readonly comments = input.required<readonly TaskComment[]>();
  /** The caller's account id: their own comments are tinted. */
  readonly myId = input<string>();
  /** When ages (`3h`) are counted from. */
  readonly now = input.required<Date>();
  /** Any role may react. */
  readonly canReact = input(false);
  /** COMMENTER+: may edit and delete their own comments. */
  readonly canWrite = input(false);
  /** The caller's queued comments for this task, oldest first. */
  readonly pending = input<readonly QueuedComment[]>([]);
  /** The caller's name, for their queued comments' avatar and byline. */
  readonly me = input<{ firstName?: string; lastName?: string } | null>();

  readonly react = output<CommentReact>();
  /** The add-reaction button: the page opens the reaction sheet. */
  readonly addReaction = output<TaskComment>();
  /** The ⋯ on the caller's own comment: the page opens Edit and Delete. */
  readonly actions = output<TaskComment>();
  /** A failed queued comment's Copy text. */
  readonly copyText = output<QueuedComment>();
  /** A failed queued comment's Delete: the page asks first. */
  readonly discard = output<QueuedComment>();

  protected readonly glyph = reactionGlyph;

  protected reactionLabel(reaction: CommentReaction): string {
    const name = reactionName(reaction.emoji);
    return `${name} ${reaction.count ?? 0}${reaction.reactedByMe ? ', including you' : ''}`;
  }

  protected author(comment: TaskComment): string {
    return (
      [comment.authorFirstName, comment.authorLastName]
        .filter(Boolean)
        .join(' ') || 'Unknown'
    );
  }

  protected initials(comment: TaskComment): string {
    return initials({
      firstName: comment.authorFirstName,
      lastName: comment.authorLastName,
    });
  }

  protected fill(comment: TaskComment): string {
    const index = avatarFillIndex(comment.authorId ?? this.author(comment));
    return `var(--flux-avatar-${index + 1})`;
  }

  protected age(comment: TaskComment): string {
    return relativeTime(comment.createdAt, this.now());
  }

  /** A queued comment as the thread's own comments look. */
  protected asComment(item: QueuedComment): TaskComment {
    return {
      id: item.id,
      authorId: this.myId(),
      authorFirstName: this.me()?.firstName,
      authorLastName: this.me()?.lastName,
      body: item.body,
      bodyFormat: 'MARKDOWN',
    };
  }

  protected isMine(comment: TaskComment): boolean {
    return !!comment.authorId && comment.authorId === this.myId();
  }
}
