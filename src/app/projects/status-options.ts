import type { WorkflowStatus } from '@core/api';
import { taskGroups } from '@core/project-list';
import type { ChipOption } from '../shared/option-chips/option-chips.component';
import { groupHueDot } from './project-colors';

/** A project's statuses as filter chips, in workflow order with their dots. */
export function statusChipOptions(
  statuses: readonly WorkflowStatus[],
  categoryPositions?: Readonly<Record<string, number>>
): ChipOption[] {
  return taskGroups('status', statuses, categoryPositions).map((g) => ({
    value: g.key,
    label: g.label ?? g.key,
    dot: groupHueDot(g.hue),
  }));
}
