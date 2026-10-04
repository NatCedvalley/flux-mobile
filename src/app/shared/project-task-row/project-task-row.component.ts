import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, IonItem } from '@ionic/angular';
import type { Task } from '@core/api';
import { avatarFillIndex, initials } from '@core/people';
import { priorityFact, projectDue } from '@core/project-list';
import { TYPE_ICONS } from '../task-row/task-row.component';

/**
 * A task row from handoff 3b, for a list already grouped by status: type
 * icon, title, a meta line (key, priority, due date) and the assignee's
 * avatar. Opens task detail on the current tab's stack.
 */
@Component({
  selector: 'app-project-task-row',
  templateUrl: './project-task-row.component.html',
  styleUrls: ['./project-task-row.component.scss'],
  imports: [RouterLink, IonItem, IonIcon],
})
export class ProjectTaskRowComponent {
  readonly task = input.required<Task>();
  /** The local day (`YYYY-MM-DD`) the due date is read against. */
  readonly today = input.required<string>();

  protected readonly icon = computed(
    () => TYPE_ICONS[this.task().type ?? 'TASK'] ?? TYPE_ICONS.TASK
  );
  protected readonly priority = computed(() =>
    priorityFact(this.task().priority)
  );
  protected readonly due = computed(() =>
    projectDue(this.task(), this.today())
  );
  /** The first assignee, who the avatar shows. */
  protected readonly assignee = computed(() => this.task().assignees?.[0]);
  protected readonly assigneeName = computed(() => {
    const person = this.assignee();
    return [person?.firstName, person?.lastName].filter(Boolean).join(' ');
  });
  protected readonly avatarInitials = computed(() =>
    initials(this.assignee() ?? {})
  );
  protected readonly avatarFill = computed(() => {
    const person = this.assignee();
    const index = avatarFillIndex(person?.accountId ?? this.assigneeName());
    return `var(--flux-avatar-${index + 1})`;
  });
}
