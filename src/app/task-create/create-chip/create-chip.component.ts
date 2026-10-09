import { Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * One of the create sheet's optional-field chips (3i): a dashed outline
 * with its field's icon while unset, filled once set (`tone` colours a
 * Critical or High priority, or an overdue date). The label is projected,
 * and a click on the chip's button reaches the host.
 */
@Component({
  selector: 'app-create-chip',
  templateUrl: './create-chip.component.html',
  styleUrls: ['./create-chip.component.scss'],
  imports: [IonIcon],
})
export class CreateChipComponent {
  /** The field's icon; none when the label brings its own (an avatar). */
  readonly icon = input<string>();
  readonly set = input(false);
  readonly tone = input<'amber' | 'red'>();
}
