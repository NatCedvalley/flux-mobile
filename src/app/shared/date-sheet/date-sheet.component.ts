import { Component, input, linkedSignal, output } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonDatetime,
  IonHeader,
  IonTitle,
  IonToolbar,
  type DatetimeCustomEvent,
} from '@ionic/angular';

/**
 * Picks a date-only `YYYY-MM-DD` (handoff: `ion-datetime presentation="date"`
 * in a sheet), or clears it. The value is never parsed, so no time zone can
 * move it a day.
 */
@Component({
  selector: 'app-date-sheet',
  templateUrl: './date-sheet.component.html',
  styleUrls: ['../sheet.scss', './date-sheet.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonDatetime,
  ],
  host: { class: 'ion-page' },
})
export class DateSheetComponent {
  readonly heading = input.required<string>();
  readonly value = input<string>();

  /** The new date, or undefined to clear it. */
  readonly saved = output<string | undefined>();
  readonly done = output();

  protected readonly draft = linkedSignal(() => this.value());

  protected onChange(event: DatetimeCustomEvent): void {
    const value = event.detail.value;
    this.draft.set(typeof value === 'string' ? value.slice(0, 10) : undefined);
  }

  protected save(): void {
    if (this.draft() === this.value()) {
      this.done.emit();
    } else {
      this.saved.emit(this.draft());
    }
  }

  protected clear(): void {
    if (this.value()) {
      this.saved.emit(undefined);
    } else {
      this.done.emit();
    }
  }
}
