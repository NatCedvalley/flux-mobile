import { Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * A list with nothing to show: an icon, one sentence, and optionally one
 * action projected as content (handoff: "one sentence plus one action").
 */
@Component({
  selector: 'app-empty-state',
  templateUrl: './empty-state.component.html',
  styleUrls: ['../list-state.scss'],
  imports: [IonIcon],
})
export class EmptyStateComponent {
  readonly message = input.required<string>();
  readonly icon = input('inbox');
}
