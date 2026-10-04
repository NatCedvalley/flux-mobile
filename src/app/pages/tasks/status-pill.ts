import type { Task, WorkflowStatus } from '@core/api';
import { statusHue } from '@core/project-list';
import { statusPillColors } from '../../projects/project-colors';

/** A status as a pill: its name and colours (`--status-*`). */
export type StatusPill = { name: string; colors: Record<string, string> };

/**
 * The pill for a status slug. A task carries only the slug, so the name and
 * colour come from the project's workflow statuses; until they load (or for
 * a slug no longer in the workflow) it's `fallbackName` or the slug as words,
 * in its category's hue.
 */
export function statusPill(
  slug: string | undefined,
  statuses: readonly WorkflowStatus[],
  category?: Task['statusCategory'],
  fallbackName?: string
): StatusPill {
  const status = statuses.find((s) => s.slug === slug);
  return {
    name: status?.name ?? fallbackName ?? words(slug ?? ''),
    colors: statusPillColors(
      statusHue(status?.color, status?.category ?? category)
    ),
  };
}

/** `in_progress` → `In progress`. */
function words(slug: string): string {
  const text = slug.replace(/[_-]+/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}
