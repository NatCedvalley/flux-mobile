import type { ProjectTasksQuery } from '../api';

/** How a project's task list is grouped, as flux-web names it. */
export const GROUP_BY_VALUES = ['none', 'status', 'priority', 'type'] as const;
export type GroupBy = (typeof GROUP_BY_VALUES)[number];

function isGroupBy(value: string | null | undefined): value is GroupBy {
  return (GROUP_BY_VALUES as readonly (string | null | undefined)[]).includes(
    value
  );
}

/**
 * The group-by in effect, resolved like flux-web: the project's own override
 * (task-view-settings), then the account's default (`/accounts/me`), then
 * status. An empty or unknown value falls through to the next tier.
 */
export function resolveGroupBy(
  projectOverride: string | null | undefined,
  accountDefault: string | null | undefined
): GroupBy {
  if (isGroupBy(projectOverride)) {
    return projectOverride;
  }
  return isGroupBy(accountDefault) ? accountDefault : 'status';
}

/**
 * How a project's tasks are shown, as flux-web writes `viewMode`. flux-web
 * also has `calendar`; it isn't built here yet, so it falls through.
 */
export const VIEW_MODES = ['list', 'board'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

function isViewMode(value: string | null | undefined): value is ViewMode {
  return (VIEW_MODES as readonly (string | null | undefined)[]).includes(value);
}

/**
 * The view in effect, resolved like flux-web: the project's own override
 * (task-view-settings `viewMode`), then the account's `defaultView`, then
 * the list. An empty or unknown value falls through to the next tier.
 */
export function resolveViewMode(
  projectOverride: string | null | undefined,
  accountDefault: string | null | undefined
): ViewMode {
  if (isViewMode(projectOverride)) {
    return projectOverride;
  }
  return isViewMode(accountDefault) ? accountDefault : 'list';
}

/** The label AI-drafted task candidates carry. */
export const AI_CANDIDATE_LABEL = 'ai:candidate';

export type AiTaskFilter = 'all' | 'ai-only' | 'human-only';

/**
 * The query params that scope a list by provenance. The project's override
 * wins; without one, AI candidates are hidden, as on the web. There is no
 * account tier.
 */
export function aiFilterQuery(
  projectOverride: string | null | undefined
): Pick<ProjectTasksQuery, 'excludeLabel' | 'requireLabel'> {
  switch (projectOverride as AiTaskFilter | null | undefined) {
    case 'all':
      return {};
    case 'ai-only':
      // requireLabel, not label: label ORs with any other label filter.
      return { requireLabel: AI_CANDIDATE_LABEL };
    default:
      return { excludeLabel: AI_CANDIDATE_LABEL };
  }
}
