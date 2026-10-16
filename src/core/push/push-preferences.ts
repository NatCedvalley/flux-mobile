import type { PushNotificationType, PushPreference } from '../api';

/** One toggle on the Notifications page: a plain name over its types. */
export type PushPreferenceGroup = {
  id: string;
  label: string;
  types: readonly PushNotificationType[];
};

export type PushPreferenceSection = {
  title: string;
  groups: readonly PushPreferenceGroup[];
};

/**
 * The page's toggles, over flux's 11 push types. A type the server adds
 * later gets no toggle until it's placed here, and stays as it is.
 */
export const PUSH_PREFERENCE_SECTIONS: readonly PushPreferenceSection[] = [
  {
    title: 'About me',
    groups: [
      { id: 'assigned', label: 'Assigned to me', types: ['ASSIGNMENT'] },
      {
        id: 'mentions',
        label: 'Mentions',
        types: ['MENTION', 'DESCRIPTION_MENTION'],
      },
      {
        id: 'reactions',
        label: 'Reactions to my comments',
        types: ['REACTION'],
      },
    ],
  },
  {
    title: 'Tasks I watch',
    groups: [
      { id: 'comments', label: 'Comments', types: ['COMMENT'] },
      { id: 'changes', label: 'Changes', types: ['TASK_UPDATED'] },
    ],
  },
  {
    title: 'Projects I watch',
    groups: [
      {
        id: 'project-tasks',
        label: 'Tasks created, deleted, archived or restored',
        types: [
          'TASK_CREATED',
          'TASK_DELETED',
          'TASK_ARCHIVED',
          'TASK_RESTORED',
        ],
      },
      { id: 'releases', label: 'New releases', types: ['RELEASE_CREATED'] },
    ],
  },
];

/**
 * The group's types as `preferences` has them. A type missing from the list
 * is on, as on the server.
 */
export function groupValues(
  group: PushPreferenceGroup,
  preferences: readonly PushPreference[]
): PushPreference[] {
  return group.types.map((type) => ({
    type,
    enabled: preferences.find((p) => p.type === type)?.enabled ?? true,
  }));
}

/** A group is on while any of its types is. */
export function groupEnabled(
  group: PushPreferenceGroup,
  preferences: readonly PushPreference[]
): boolean {
  return groupValues(group, preferences).some((p) => p.enabled);
}

/** Turning a group on or off writes every one of its types. */
export function groupChange(
  group: PushPreferenceGroup,
  enabled: boolean
): PushPreference[] {
  return group.types.map((type) => ({ type, enabled }));
}

/** `preferences` with `changes` applied, each type replaced or added. */
export function withPreferences(
  preferences: readonly PushPreference[],
  changes: readonly PushPreference[]
): PushPreference[] {
  const changed = (type: PushNotificationType) =>
    changes.find((c) => c.type === type);
  return [
    ...preferences.map((p) => changed(p.type) ?? p),
    ...changes.filter((c) => !preferences.some((p) => p.type === c.type)),
  ];
}
