import {
  Component,
  computed,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonTextarea,
  IonTitle,
  IonToolbar,
  type TextareaCustomEvent,
} from '@ionic/angular';

/**
 * Edits one piece of text (a title, a description) in a sheet: Cancel, Save
 * once it has changed, and a counter when there's a limit. `singleLine`
 * saves on Enter instead of starting a new line.
 */
@Component({
  selector: 'app-text-edit-sheet',
  templateUrl: './text-edit-sheet.component.html',
  styleUrls: ['../sheet.scss', './text-edit-sheet.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonTextarea,
  ],
  host: { class: 'ion-page' },
})
export class TextEditSheetComponent {
  readonly heading = input.required<string>();
  readonly value = input('');
  readonly maxLength = input<number>();
  readonly required = input(false);
  readonly singleLine = input(false);
  readonly placeholder = input('');
  /** Shown under the field, e.g. what the text is written in. */
  readonly hint = input<string>();

  readonly saved = output<string>();
  readonly done = output();

  protected readonly draft = linkedSignal(() => this.value());
  protected readonly canSave = computed(() => {
    const text = this.draft().trim();
    return text !== this.value().trim() && (!this.required() || !!text);
  });

  private readonly field = viewChild.required(IonTextarea);

  /** Focuses the field; call once the sheet has opened. */
  focus(): void {
    void this.field().setFocus();
  }

  protected onInput(event: TextareaCustomEvent): void {
    this.draft.set(event.detail.value ?? '');
  }

  protected onEnter(event: Event): void {
    if (this.singleLine()) {
      event.preventDefault();
      this.save();
    }
  }

  protected save(): void {
    if (this.canSave()) {
      this.saved.emit(this.draft().trim());
    }
  }
}
