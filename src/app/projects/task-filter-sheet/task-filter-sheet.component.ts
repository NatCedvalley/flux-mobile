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
import { avatarFillIndex, initials } from '@core/people';
import {
  type AssigneeOption,
  EMPTY_FILTERS,
  PRIORITY_OPTIONS,
  type Priority,
  type TaskFilters,
} from '@core/task-filters';
import {
  type ChipOption,
  OptionChipsComponent,
} from '../../shared/option-chips/option-chips.component';

/**
 * The project list's filter sheet: status and priority chips, and the
 * project's members to filter by assignee. It edits `filters` as a draft;
 * the page applies it when the sheet closes, so the list refetches once.
 */
@Component({
  selector: 'app-task-filter-sheet',
  templateUrl: './task-filter-sheet.component.html',
  styleUrls: ['../../shared/sheet.scss', './task-filter-sheet.component.scss'],
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
export class TaskFilterSheetComponent {
  readonly filters = model<TaskFilters>(EMPTY_FILTERS);
  /** The project's statuses, in workflow order. */
  readonly statusOptions = input.required<readonly ChipOption[]>();
  /** The assignee rows; undefined while they load. */
  readonly assignees = input<readonly AssigneeOption[]>();
  readonly assigneesFailed = input(false);

  readonly done = output();
  readonly retryAssignees = output();

  protected readonly priorityOptions = PRIORITY_OPTIONS;

  protected setStatuses(statuses: readonly string[]): void {
    this.filters.update((f) => ({ ...f, statuses }));
  }

  protected setPriorities(priorities: readonly string[]): void {
    this.filters.update((f) => ({
      ...f,
      priorities: priorities as readonly Priority[],
    }));
  }

  protected isAssignee(accountId: string): boolean {
    return this.filters().assigneeIds.includes(accountId);
  }

  protected toggleAssignee(accountId: string): void {
    this.filters.update((f) => ({
      ...f,
      assigneeIds: f.assigneeIds.includes(accountId)
        ? f.assigneeIds.filter((id) => id !== accountId)
        : [...f.assigneeIds, accountId],
    }));
  }

  protected reset(): void {
    this.filters.set(EMPTY_FILTERS);
  }

  protected initials(option: AssigneeOption): string {
    return initials(option.person);
  }

  protected avatarFill(option: AssigneeOption): string {
    return `var(--flux-avatar-${avatarFillIndex(option.accountId) + 1})`;
  }
}
