import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import type { Task } from '@core/api';
import { avatarFillIndex, initials } from '@core/people';
import { priorityFact, projectDue } from '@core/project-list';
import { TYPE_ICONS } from '../../shared/task-row/task-row.component';

/** A footer chip: a release (violet) or a label (gray). */
type CardChip = { kind: 'release' | 'label'; text: string };

/**
 * A board card (handoff 3c): type icon, key and priority, the title, then
 * up to two chips (the first release, then labels), the due date (red with
 * a clock when due today or overdue) and the assignee's avatar. The list
 * response carries no comment or attachment counts, so the card has none.
 * Opens task detail on the current tab's stack.
 */
@Component({
  selector: 'app-board-card',
  templateUrl: './board-card.component.html',
  styleUrls: ['./board-card.component.scss'],
  imports: [RouterLink, IonIcon],
})
export class BoardCardComponent {
  readonly task = input.required<Task>();
  /** The local day (`YYYY-MM-DD`) the due date is read against. */
  readonly today = input.required<string>();

  protected readonly icon = computed(
    () => TYPE_ICONS[this.task().type ?? 'TASK'] ?? TYPE_ICONS.TASK
  );
  protected readonly priority = computed(() =>
    priorityFact(this.task().priority)
  );
  protected readonly chips = computed<CardChip[]>(() => {
    const task = this.task();
    const release = task.linkedReleases?.[0]?.versionTag;
    const chips: CardChip[] = release
      ? [{ kind: 'release', text: release }]
      : [];
    for (const label of task.labels ?? []) {
      chips.push({ kind: 'label', text: label });
    }
    return chips.slice(0, 2);
  });
  /** The due date, if any; urgent when it's today or past (and still open). */
  protected readonly due = computed(() => {
    const task = this.task();
    if (!task.dueDate) {
      return undefined;
    }
    const { label, overdue } = projectDue(task, this.today());
    const today =
      task.dueDate === this.today() && task.statusCategory !== 'DONE';
    return { label, urgent: overdue || today };
  });
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
