import { Component, input, model, output } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { MyProject } from '@core/api';
import {
  EMPTY_MY_TASK_FILTERS,
  type MyTaskFilters,
  PRIORITY_OPTIONS,
  type Priority,
} from '@core/task-filters';
import {
  type ChipOption,
  OptionChipsComponent,
} from '../../shared/option-chips/option-chips.component';

/**
 * My Work search's filter sheet: one project, that project's statuses, and
 * priorities. Statuses belong to a project (my-tasks matches their slugs in
 * every project), so they wait for a project to be picked. It edits
 * `filters` as a draft that the page applies when the sheet closes.
 */
@Component({
  selector: 'app-my-task-filter-sheet',
  templateUrl: './my-task-filter-sheet.component.html',
  styleUrls: ['../../shared/sheet.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonSkeletonText,
    OptionChipsComponent,
  ],
  host: { class: 'ion-page' },
})
export class MyTaskFilterSheetComponent {
  readonly filters = model<MyTaskFilters>(EMPTY_MY_TASK_FILTERS);
  /** The user's projects; undefined while they load. */
  readonly projects = input<readonly MyProject[]>();
  /** The chosen project's statuses; undefined while they load. */
  readonly statusOptions = input<readonly ChipOption[]>();
  readonly loadFailed = input(false);

  readonly done = output();
  readonly retry = output();

  protected readonly priorityOptions = PRIORITY_OPTIONS;

  /** Picks a project (or none), dropping the last one's statuses. */
  protected chooseProject(projectId: string | undefined): void {
    this.filters.update((f) =>
      f.projectId === projectId ? f : { ...f, projectId, statuses: [] }
    );
  }

  protected setStatuses(statuses: readonly string[]): void {
    this.filters.update((f) => ({ ...f, statuses }));
  }

  protected setPriorities(priorities: readonly string[]): void {
    this.filters.update((f) => ({
      ...f,
      priorities: priorities as readonly Priority[],
    }));
  }

  protected reset(): void {
    this.filters.set(EMPTY_MY_TASK_FILTERS);
  }
}
