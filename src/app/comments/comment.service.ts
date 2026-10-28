import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import type { CommentReaction, TaskComment } from '@core/api';
import { ApiError } from '@core/auth';
import { reactionToggles } from '@core/comments';
import { AnalyticsService } from '../analytics/analytics.service';
import { ConnectivityService } from '../offline/connectivity.service';
import {
  OFFLINE_MESSAGES,
  OfflineToastService,
} from '../offline/offline-toast.service';
import { WriteQueueService } from '../offline/write-queue.service';
import { FLUX_API } from '../providers/flux-api.token';

const TOAST_MS = 3000;

/** The task a comment belongs to, and where its toasts sit. */
export type CommentTarget = {
  projectId: string;
  taskId: string;
  /** Names the task in the replay's toasts. */
  taskKey?: string;
  /** The docked footer the toasts sit above, if any. */
  anchor?: HTMLElement | string;
};

/**
 * Comment writes from task detail: posting, editing, deleting and reacting.
 * Each resolves with the server's answer for the page to show, or
 * `undefined` / `false` once the failure has been shown as a toast with the
 * server's message (COMMENT_NOT_AUTHOR, COMMENT_HAS_REPLIES, …). A new
 * comment is queued while offline (`WriteQueueService`); edits, deletes and
 * reactions need a connection.
 */
@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);
  private readonly online = inject(ConnectivityService).online;
  private readonly offlineToast = inject(OfflineToastService);
  private readonly writeQueue = inject(WriteQueueService);
  private readonly analytics = inject(AnalyticsService);

  /**
   * Posts a Markdown comment. The response has no reactions or replies.
   * Resolves `'queued'` when it was queued instead: offline, when the POST
   * got no response (it may still have arrived, which the replay checks),
   * or behind a comment of the task's still queued, to keep their order.
   */
  async post(
    target: CommentTarget,
    body: string,
    mentionedAccountIds: readonly string[]
  ): Promise<TaskComment | 'queued' | undefined> {
    if (!this.online() || this.writeQueue.commentPending(target.taskId)) {
      return this.enqueue(target, body, mentionedAccountIds, false);
    }
    try {
      const comment = await this.api.addTaskComment(
        target.projectId,
        target.taskId,
        {
          body,
          bodyFormat: 'MARKDOWN',
          mentionedAccountIds: mentionedAccountIds.length
            ? [...mentionedAccountIds]
            : undefined,
        }
      );
      void this.analytics.log({
        name: 'comment_post',
        params: { outcome: 'sent' },
      });
      return comment;
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        return this.enqueue(target, body, mentionedAccountIds, true);
      }
      await this.error(error, 'Couldn’t post the comment', target.anchor);
      return undefined;
    }
  }

  /** Saves `body` as the comment's Markdown. The response has no reactions or replies. */
  async update(
    target: CommentTarget,
    comment: TaskComment,
    body: string
  ): Promise<TaskComment | undefined> {
    if (!this.online()) {
      await this.offlineToast.show(OFFLINE_MESSAGES.edit, target.anchor);
      return undefined;
    }
    try {
      return await this.api.updateTaskComment(
        target.projectId,
        target.taskId,
        comment.id ?? '',
        { body, bodyFormat: 'MARKDOWN' }
      );
    } catch (error) {
      await this.error(error, 'Couldn’t save the comment', target.anchor);
      return undefined;
    }
  }

  /** Deletes the comment. Resolves with whether the server took it. */
  async remove(target: CommentTarget, comment: TaskComment): Promise<boolean> {
    if (!this.online()) {
      await this.offlineToast.show(
        OFFLINE_MESSAGES.deleteComment,
        target.anchor
      );
      return false;
    }
    try {
      await this.api.deleteTaskComment(
        target.projectId,
        target.taskId,
        comment.id ?? ''
      );
    } catch (error) {
      await this.error(error, 'Couldn’t delete the comment', target.anchor);
      return false;
    }
    await this.toast('Comment deleted', target.anchor);
    return true;
  }

  /**
   * Toggles the caller's `emoji` reaction, first taking off a different one
   * of theirs (one reaction per person, as on the web). Resolves with the
   * comment's reactions from the last toggle that landed, so a half-done
   * switch still shows what the server holds.
   */
  async react(
    target: CommentTarget,
    comment: TaskComment,
    emoji: string
  ): Promise<CommentReaction[] | undefined> {
    if (!this.online()) {
      await this.offlineToast.show(OFFLINE_MESSAGES.react, target.anchor);
      return undefined;
    }
    let reactions: CommentReaction[] | undefined;
    try {
      for (const key of reactionToggles(comment.reactions, emoji)) {
        reactions = await this.api.toggleCommentReaction(
          target.projectId,
          target.taskId,
          comment.id ?? '',
          key
        );
      }
    } catch (error) {
      await this.error(error, 'Couldn’t change the reaction', target.anchor);
    }
    return reactions;
  }

  /** Queues the comment, or says it couldn't (no account loaded yet). */
  private async enqueue(
    target: CommentTarget,
    body: string,
    mentionedAccountIds: readonly string[],
    attempted: boolean
  ): Promise<'queued' | undefined> {
    const queued = await this.writeQueue.enqueueComment({
      projectId: target.projectId,
      taskId: target.taskId,
      taskKey: target.taskKey,
      body,
      mentionedAccountIds: [...mentionedAccountIds],
      attempted,
    });
    if (!queued) {
      await this.toast('Couldn’t post the comment', target.anchor);
      return undefined;
    }
    void this.analytics.log({
      name: 'comment_post',
      params: { outcome: 'queued' },
    });
    return 'queued';
  }

  private error(
    error: unknown,
    fallback: string,
    anchor: HTMLElement | string | undefined
  ): Promise<void> {
    return this.toast(
      error instanceof ApiError && error.body.message
        ? error.body.message
        : fallback,
      anchor
    );
  }

  private async toast(
    message: string,
    anchor: HTMLElement | string | undefined
  ): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: TOAST_MS,
      position: 'bottom',
      positionAnchor: anchor,
    });
    await toast.present();
  }
}
