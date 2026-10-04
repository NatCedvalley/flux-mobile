import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, IonItem } from '@ionic/angular';
import type { MyTask } from '@core/api';
import {
  type ProjectHue,
  type StatusTone,
  isOverdue,
  projectHue,
  secondFact,
  statusTone,
} from '@core/my-work';

/** The handoff's icon for each task type. */
export const TYPE_ICONS: Record<NonNullable<MyTask['type']>, string> = {
  BUG: 'bug',
  FEATURE: 'sparkles',
  TASK: 'square-check',
  IMPROVEMENT: 'trending-up',
  EPIC: 'layers',
  MASTER: 'orbit',
};

/** The status dot (hue 9) and word (hue 11) for each tone. */
const TONE_COLORS: Record<StatusTone, [dot: string, text: string]> = {
  planning: ['n8', 'na11'],
  todo: ['blue9', 'blue11'],
  progress: ['amber9', 'amber11'],
  done: ['green9', 'green11'],
};

/** The chip's a3 fill and 11 text for a project hue; indigo is `p`. */
function chipColors(hue: ProjectHue): [fill: string, text: string] {
  return hue === 'indigo' ? ['pa3', 'p11'] : [`${hue}a3`, `${hue}11`];
}

/**
 * A task row from handoff 3a: type icon, title, a meta line (status, a
 * second fact, key) and the project chip. Opens task detail on the current
 * tab's stack.
 */
@Component({
  selector: 'app-task-row',
  templateUrl: './task-row.component.html',
  styleUrls: ['./task-row.component.scss'],
  imports: [RouterLink, IonItem, IonIcon],
})
export class TaskRowComponent {
  readonly task = input.required<MyTask>();
  /** The local day (`YYYY-MM-DD`) the due date is read against. */
  readonly today = input.required<string>();

  protected readonly icon = computed(
    () => TYPE_ICONS[this.task().type ?? 'TASK'] ?? TYPE_ICONS.TASK
  );
  protected readonly overdue = computed(() =>
    isOverdue(this.task(), this.today())
  );
  protected readonly status = computed(
    () => this.task().statusName ?? this.task().status
  );
  protected readonly statusColors = computed(() => {
    const [dot, text] = TONE_COLORS[statusTone(this.task().statusCategory)];
    return {
      '--status-dot': `var(--flux-${dot})`,
      '--status-text': `var(--flux-${text})`,
    };
  });
  protected readonly fact = computed(() =>
    secondFact(this.task(), this.today())
  );
  protected readonly chipColors = computed(() => {
    const [fill, text] = chipColors(projectHue(this.task().projectId ?? ''));
    return {
      '--chip-fill': `var(--flux-${fill})`,
      '--chip-text': `var(--flux-${text})`,
    };
  });
}
