import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';
import type { CommentReaction } from '@core/api';
import { REACTIONS } from '@core/comments';

/** What the comment sheet was opened for. */
export type CommentSheetMode = 'actions' | 'react';

/** The row chosen: a reaction's key, or Edit or Delete. */
export type CommentSheetChoice =
  { kind: 'delete' } | { kind: 'edit' } | { kind: 'react'; emoji: string };

/**
 * A comment's sheet, as tall as its content. `react` (the add-reaction
 * button) offers flux-web's eight reactions, the caller's own marked; a
 * tap toggles it. `actions` (the ⋯ on the caller's own comment) offers
 * Edit, then Delete in red after a band, as the task overflow sheet (3n).
 * The page runs the choice once the sheet has closed.
 */
@Component({
  selector: 'app-comment-sheet',
  templateUrl: './comment-sheet.component.html',
  styleUrls: [
    '../../../shared/sheet.scss',
    '../task-overflow-sheet/task-overflow-sheet.component.scss',
    './comment-sheet.component.scss',
  ],
  imports: [IonList, IonItem, IonLabel, IonIcon, IonButton],
  host: { class: 'ion-page' },
})
export class CommentSheetComponent {
  readonly mode = input.required<CommentSheetMode>();
  /** The comment's reactions, to mark the caller's. */
  readonly reactions = input<readonly CommentReaction[]>();
  /** Whether the app can edit the body (it writes Markdown only). */
  readonly editable = input(true);

  readonly choice = output<CommentSheetChoice>();
  readonly done = output();

  protected readonly choices = REACTIONS;
  protected readonly mine = computed(
    () => this.reactions()?.find((r) => r.reactedByMe)?.emoji
  );
}
