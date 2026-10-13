import { Component, input, output } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonList,
  type InfiniteScrollCustomEvent,
} from '@ionic/angular';
import type { Task } from '@core/api';
import type { PagedListState } from '@core/task-filters';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { ProjectTaskRowComponent } from '../../shared/project-task-row/project-task-row.component';

/**
 * The Unscheduled drawer's contents (handoff 3d): the handle row (inbox
 * icon, title, count and, for an EDITOR+, the drag hint), which moves the
 * drawer between its stops, over the undated tasks, paged as it scrolls.
 * The rows sit in a `data-column` of `dragKey`, so the calendar's drag can
 * pick them up.
 */
@Component({
  selector: 'app-unscheduled-list',
  templateUrl: './unscheduled-list.component.html',
  styleUrls: ['./unscheduled-list.component.scss'],
  imports: [
    IonButton,
    IonContent,
    IonIcon,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonList,
    EmptyStateComponent,
    ErrorStateComponent,
    ProjectTaskRowComponent,
  ],
})
export class UnscheduledListComponent {
  readonly rows = input.required<PagedListState<Task>>();
  /** The first page has landed (the count shows from then). */
  readonly loaded = input(false);
  /** The first page failed. */
  readonly error = input<unknown>();
  /** The next page failed: Retry under the rows. */
  readonly moreFailed = input(false);
  readonly today = input.required<string>();
  /** The drawer is above its handle row. */
  readonly expanded = input(false);
  /** Rows can be dragged onto a day (EDITOR+): the hint says so. */
  readonly canEdit = input(false);
  /** The held row, dimmed while it's dragged. */
  readonly pickedId = input<string>();
  readonly dragKey = input.required<string>();

  readonly toggled = output<void>();
  readonly retry = output<void>();
  readonly retryMore = output<void>();
  readonly loadMore = output<InfiniteScrollCustomEvent>();
}
