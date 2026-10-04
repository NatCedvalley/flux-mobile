import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import type { TaskActivity, WorkflowStatus } from '@core/api';
import { localIsoDate } from '@core/my-work';
import {
  type ActivityView,
  activityDays,
  activityView,
  timeOfDay,
} from '@core/task-detail';
import { type StatusPill, statusPill } from '../status-pill';

type Entry = {
  id: string | undefined;
  actor: string;
  time: string;
  view: ActivityView;
  /** A status change's two pills. */
  statuses?: { from: StatusPill; to: StatusPill };
};

/**
 * The Activity tab's timeline (3g): entries newest first under day headers,
 * each with a badge tinted by the kind of change and `old → new` values.
 */
@Component({
  selector: 'app-task-activity',
  templateUrl: './task-activity.component.html',
  styleUrls: ['./task-activity.component.scss'],
  imports: [IonIcon],
})
export class TaskActivityComponent {
  readonly entries = input.required<readonly TaskActivity[]>();
  /** The project's workflow, for status names and colours. */
  readonly statuses = input<readonly WorkflowStatus[]>([]);
  /** When the day headers (`Today`) are counted from. */
  readonly now = input.required<Date>();

  protected readonly days = computed(() => {
    const today = localIsoDate(this.now());
    return activityDays(this.entries(), this.now()).map((day) => ({
      day: day.day,
      label: day.label,
      entries: day.entries.map((entry) => this.entry(entry, today)),
    }));
  });

  private entry(entry: TaskActivity, today: string): Entry {
    const view = activityView(entry, today);
    const change = view.change;
    return {
      id: entry.id,
      actor: entry.actorName || 'Someone',
      time: timeOfDay(entry.createdAt),
      view,
      statuses:
        change?.kind === 'status'
          ? {
              from: statusPill(change.from, this.statuses()),
              to: statusPill(change.to, this.statuses()),
            }
          : undefined,
    };
  }
}
