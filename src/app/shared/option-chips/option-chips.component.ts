import { Component, input, model } from '@angular/core';
import { IonChip } from '@ionic/angular';

/** One chip: its value, label and, for a status, its hue's dot colour. */
export type ChipOption = { value: string; label: string; dot?: string };

/**
 * A row of chips to pick any number of values from (3k's chip row): a
 * filter sheet's statuses or priorities. Selected chips take the indigo
 * wash.
 */
@Component({
  selector: 'app-option-chips',
  templateUrl: './option-chips.component.html',
  styleUrls: ['./option-chips.component.scss'],
  imports: [IonChip],
  host: { role: 'group' },
})
export class OptionChipsComponent {
  readonly options = input.required<readonly ChipOption[]>();
  readonly selected = model<readonly string[]>([]);
  readonly disabled = input(false);

  protected isSelected(value: string): boolean {
    return this.selected().includes(value);
  }

  protected toggle(value: string): void {
    this.selected.update((values) =>
      values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value]
    );
  }
}
