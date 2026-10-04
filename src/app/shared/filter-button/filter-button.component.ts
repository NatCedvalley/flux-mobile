import { Component, computed, input } from '@angular/core';
import { IonBadge, IonIcon } from '@ionic/angular';

/**
 * The Filters button (3b's strip): an indigo-washed 28px button with a
 * badge counting the filters in use, hidden when there are none. The host
 * listens for its click.
 */
@Component({
  selector: 'app-filter-button',
  templateUrl: './filter-button.component.html',
  styleUrls: ['./filter-button.component.scss'],
  imports: [IonBadge, IonIcon],
})
export class FilterButtonComponent {
  readonly count = input(0);

  protected readonly label = computed(() => {
    const count = this.count();
    return count ? `Filters, ${count} active` : 'Filters';
  });
}
