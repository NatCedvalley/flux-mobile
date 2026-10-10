import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import type { Task } from '@core/api';
import { type PersonName, avatarFillIndex, initials } from '@core/people';
import { assigneeSummary, detailDue } from '@core/task-detail';
import { canEditDescription } from '@core/task-edit';
import { RichTextComponent } from '../../../shared/rich-text/rich-text.component';
import { TYPE_ICONS } from '../../../shared/task-row/task-row.component';

/** Lines of description shown before Show more (handoff: ~6). */
const DESCRIPTION_LINES = 6;
/** Label chips shown before `+n`. */
const LABELS_SHOWN = 2;

type Person = {
  name: string;
  initials: string;
  fill: string;
};

/**
 * The Details tab (3e): assignee and reporter, the due date, release, parent
 * and labels, the description, and a container's subtasks. When `editable`,
 * the due date and labels rows and the description's pencil ask the page to
 * open their editors. The parent row always opens the parent; it changes
 * from the overflow sheet. A description the app can't write (HTML,
 * Editor.js) gets a note to edit it on the web instead of the pencil. The
 * Attachments row shows their count and asks the page to open them.
 */
@Component({
  selector: 'app-task-details',
  templateUrl: './task-details.component.html',
  styleUrls: ['./task-details.component.scss'],
  imports: [NgTemplateOutlet, RouterLink, IonIcon, RichTextComponent],
})
export class TaskDetailsComponent {
  readonly task = input.required<Task>();
  /** The local day (`YYYY-MM-DD`) the due date is read against. */
  readonly today = input.required<string>();
  /** A container's subtasks; undefined while they load. */
  readonly subtasks = input<Task[]>();
  /** The URL that task detail paths sit under, for parent and subtask links. */
  readonly detailBase = input.required<string>();
  /** Whether the caller may edit the task (EDITOR+, not archived). */
  readonly editable = input(false);
  /** The Attachments row's count: blank while loading, `—` if it failed. */
  readonly attachmentCount = input('');

  readonly editDue = output();
  readonly editLabels = output();
  readonly editDescription = output();
  readonly openAttachments = output();

  protected readonly descriptionLines = DESCRIPTION_LINES;

  protected readonly assignees = computed(() =>
    assigneeSummary(this.task().assignees)
  );
  protected readonly assignee = computed(() => {
    const first = this.assignees().first;
    return first ? person(first, first.accountId) : undefined;
  });
  protected readonly reporter = computed(() => {
    const task = this.task();
    return task.reporterFirstName || task.reporterLastName
      ? person(
          {
            firstName: task.reporterFirstName,
            lastName: task.reporterLastName,
          },
          task.reporterId
        )
      : undefined;
  });

  protected readonly descriptionEditable = computed(() =>
    canEditDescription(this.task())
  );

  protected readonly due = computed(() => detailDue(this.task(), this.today()));
  protected readonly release = computed(() => {
    const releases = this.task().linkedReleases ?? [];
    const first = releases[0];
    return first
      ? {
          label: [first.versionTag, first.title].filter(Boolean).join(' '),
          more: releases.length - 1,
        }
      : undefined;
  });
  protected readonly labels = computed(() => {
    const labels = this.task().labels ?? [];
    return {
      shown: labels.slice(0, LABELS_SHOWN),
      more: Math.max(labels.length - LABELS_SHOWN, 0),
    };
  });

  /** Only containers have subtasks, as on the web. */
  protected readonly isContainer = computed(() => {
    const type = this.task().type;
    return type === 'MASTER' || type === 'EPIC';
  });

  protected link(id: string | undefined): string {
    return `${this.detailBase()}/${encodeURIComponent(this.task().projectId ?? '')}/${encodeURIComponent(id ?? '')}`;
  }

  protected typeIcon(type: Task['type']): string {
    return TYPE_ICONS[type ?? 'TASK'] ?? TYPE_ICONS.TASK;
  }
}

function person(name: PersonName, key: string | undefined): Person {
  const full = [name.firstName, name.lastName].filter(Boolean).join(' ');
  return {
    name: full,
    initials: initials(name),
    fill: `var(--flux-avatar-${avatarFillIndex(key ?? full) + 1})`,
  };
}
