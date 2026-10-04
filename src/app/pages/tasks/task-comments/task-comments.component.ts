import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import type { TaskComment } from '@core/api';
import { avatarFillIndex, initials } from '@core/people';
import { relativeTime } from '@core/task-detail';
import { RichTextComponent } from '../../../shared/rich-text/rich-text.component';

/**
 * The Comments tab's thread (3f), read-only: oldest first, each top-level
 * comment followed by its replies, with reactions. Writing and reacting
 * come in FM-34.
 */
@Component({
  selector: 'app-task-comments',
  templateUrl: './task-comments.component.html',
  styleUrls: ['./task-comments.component.scss'],
  imports: [NgTemplateOutlet, RichTextComponent],
})
export class TaskCommentsComponent {
  readonly comments = input.required<readonly TaskComment[]>();
  /** The caller's account id: their own comments are tinted. */
  readonly myId = input<string>();
  /** When ages (`3h`) are counted from. */
  readonly now = input.required<Date>();

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

  protected isMine(comment: TaskComment): boolean {
    return !!comment.authorId && comment.authorId === this.myId();
  }
}
