import {
  Component,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  type SearchbarCustomEvent,
} from '@ionic/angular';
import { SEARCH_DEBOUNCE_MS, debounced } from '../debounced';

/** A row of the picker. */
export type PickerItem = {
  id: string;
  label: string;
  /** Shown before the label in the key type, e.g. a task's key. */
  key?: string;
  /** A person's avatar: their initials on one of the avatar fills. */
  avatar?: { initials: string; fill: string };
  icon?: string;
};

/**
 * The one choice sheet for long lists (handoff: assignee, label and parent
 * pickers): a searchbar over a list, choosing one row or several. A single
 * choice emits `picked`; several edit `selected` as a draft, which the page
 * applies when the sheet closes. With `remoteSearch` the page does the
 * searching: `searched` emits the query once typing pauses (and '' at once).
 */
@Component({
  selector: 'app-picker-sheet',
  templateUrl: './picker-sheet.component.html',
  styleUrls: ['../sheet.scss', './picker-sheet.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonSkeletonText,
  ],
  host: { class: 'ion-page' },
})
export class PickerSheetComponent {
  readonly heading = input.required<string>();
  /** The rows; undefined while they load. */
  readonly items = input<readonly PickerItem[]>();
  readonly failed = input(false);
  readonly multiple = input(false);
  readonly searchable = input(true);
  readonly remoteSearch = input(false);
  readonly placeholder = input('Search');
  readonly emptyText = input('Nothing matches');
  readonly selected = model<readonly string[]>([]);

  readonly picked = output<string>();
  readonly searched = output<string>();
  readonly retry = output();
  readonly done = output();

  protected readonly query = signal('');
  private readonly sentQuery = debounced(this.query, SEARCH_DEBOUNCE_MS);

  protected readonly shown = computed(() => {
    const items = this.items();
    const term = this.query().trim().toLowerCase();
    if (!items || this.remoteSearch() || !term) {
      return items;
    }
    return items.filter((item) =>
      `${item.key ?? ''} ${item.label}`.toLowerCase().includes(term)
    );
  });

  constructor() {
    effect(() => {
      const query = this.sentQuery().trim();
      if (this.remoteSearch()) {
        untracked(() => this.searched.emit(query));
      }
    });
  }

  protected isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  protected onSearch(event: SearchbarCustomEvent): void {
    this.query.set(event.detail.value ?? '');
  }

  protected choose(id: string): void {
    if (this.multiple()) {
      this.selected.update((ids) =>
        ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
      );
    } else {
      this.selected.set([id]);
      this.picked.emit(id);
    }
  }
}
