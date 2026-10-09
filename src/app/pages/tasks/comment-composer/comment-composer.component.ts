import {
  Component,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  IonButton,
  IonFooter,
  IonIcon,
  IonTextarea,
  type TextareaCustomEvent,
} from '@ionic/angular';
import {
  type Mention,
  insertMention,
  mentionTrigger,
  mentionedIds,
} from '@core/comments';

/** A comment ready to post. */
export type CommentDraft = { body: string; mentionedAccountIds: string[] };

/**
 * The Comments tab's docked composer (3f): a growing field with an @ button,
 * and Send once there is text. Typing an @ that starts a word, or tapping
 * the button, asks the page for the member picker (`mention`); the page
 * hands the pick back through `insertMention`. A mention is plain
 * `@First Last` text: its id is sent while that text stays in the comment.
 * With `canAttach` (EDITOR+), a paperclip asks the page to attach a file to
 * the task; the comment text is left alone.
 */
@Component({
  selector: 'app-comment-composer',
  templateUrl: './comment-composer.component.html',
  styleUrls: ['./comment-composer.component.scss'],
  imports: [IonFooter, IonTextarea, IonButton, IonIcon],
})
export class CommentComposerComponent {
  /** A post is in flight: Send waits for it. */
  readonly sending = input(false);
  /** Whether the paperclip shows: uploading takes EDITOR+. */
  readonly canAttach = input(false);
  /** An upload is in flight: the paperclip waits for it. */
  readonly attaching = input(false);

  readonly send = output<CommentDraft>();
  readonly mention = output();
  readonly attach = output();

  protected readonly text = signal('');
  protected readonly canSend = computed(
    () => !!this.text().trim() && !this.sending()
  );
  private mentions: Mention[] = [];
  /** Where the caret was when the picker opened. */
  private caret = 0;

  private readonly field = viewChild.required(IonTextarea);

  /**
   * Focuses the field, e.g. from the docked comment button. On a composer
   * that has only just rendered, Ionic's field has no textarea yet and
   * `setFocus` does nothing; `getInputElement` waits for it.
   */
  async focus(): Promise<void> {
    const input = await this.field().getInputElement();
    input.focus();
  }

  /** Empties the field once its comment has posted. */
  clear(): void {
    this.text.set('');
    this.mentions = [];
  }

  /** Puts the member picked in the picker into the text, at the caret. */
  async insertMention(mention: Mention): Promise<void> {
    const { text, caret } = insertMention(
      this.text(),
      this.caret,
      mention.name
    );
    this.text.set(text);
    this.mentions = [...this.mentions, mention];
    const field = this.field();
    await field.setFocus();
    const input = await field.getInputElement();
    input.value = text;
    input.setSelectionRange(caret, caret);
  }

  protected async onInput(event: TextareaCustomEvent): Promise<void> {
    const text = event.detail.value ?? '';
    this.text.set(text);
    const caret = await this.readCaret(text.length);
    if (mentionTrigger(text, caret)) {
      this.openPicker(caret);
    }
  }

  protected async atTapped(): Promise<void> {
    this.openPicker(await this.readCaret(this.text().length));
  }

  protected submit(): void {
    if (!this.canSend()) {
      return;
    }
    const body = this.text().trim();
    this.send.emit({
      body,
      mentionedAccountIds: mentionedIds(body, this.mentions),
    });
  }

  private openPicker(caret: number): void {
    this.caret = caret;
    this.mention.emit();
  }

  /** The caret in the native textarea, or `fallback` before it exists. */
  private async readCaret(fallback: number): Promise<number> {
    try {
      const input = await this.field().getInputElement();
      return input.selectionStart ?? fallback;
    } catch {
      return fallback;
    }
  }
}
