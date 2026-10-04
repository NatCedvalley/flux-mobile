import { Component, input } from '@angular/core';
import { IonItem, IonList, IonSkeletonText } from '@ionic/angular';

/**
 * Placeholder task rows for a list's first load, at the real row height.
 * They fade in only after 200ms, so a quick load never flashes them.
 */
@Component({
  selector: 'app-skeleton-rows',
  templateUrl: './skeleton-rows.component.html',
  styleUrls: ['./skeleton-rows.component.scss'],
  imports: [IonList, IonItem, IonSkeletonText],
  host: {
    'aria-busy': 'true',
    'aria-label': 'Loading',
    '[style.--row-height.px]': 'rowHeight()',
  },
})
export class SkeletonRowsComponent {
  /** How many rows to draw; the handoff shows 6. */
  readonly count = input(6);
  /** The real rows' minimum height: 68px on My Work, 62px in a project. */
  readonly rowHeight = input(68);

  protected rows(): number[] {
    return Array.from({ length: this.count() }, (_, i) => i);
  }
}
