import type { PushPreference } from '../api';
import {
  PUSH_PREFERENCE_SECTIONS,
  groupChange,
  groupEnabled,
  groupValues,
  withPreferences,
} from './push-preferences';

const groups = PUSH_PREFERENCE_SECTIONS.flatMap((s) => s.groups);
const group = (id: string) => groups.find((g) => g.id === id)!;

describe('push preference groups', () => {
  it('give every push type exactly one toggle', () => {
    const types = groups.flatMap((g) => g.types);
    expect(new Set(types).size).toBe(types.length);
    expect(types).toHaveLength(11);
  });

  it('are on while any member is on', () => {
    const mentions = group('mentions');
    expect(
      groupEnabled(mentions, [
        { type: 'MENTION', enabled: false },
        { type: 'DESCRIPTION_MENTION', enabled: true },
      ])
    ).toBe(true);
    expect(
      groupEnabled(mentions, [
        { type: 'MENTION', enabled: false },
        { type: 'DESCRIPTION_MENTION', enabled: false },
      ])
    ).toBe(false);
  });

  it('count a type missing from the list as on', () => {
    expect(groupValues(group('assigned'), [])).toEqual([
      { type: 'ASSIGNMENT', enabled: true },
    ]);
  });

  it('write every member on a change', () => {
    expect(groupChange(group('mentions'), false)).toEqual([
      { type: 'MENTION', enabled: false },
      { type: 'DESCRIPTION_MENTION', enabled: false },
    ]);
  });
});

describe('withPreferences', () => {
  const preferences: PushPreference[] = [
    { type: 'ASSIGNMENT', enabled: true },
    { type: 'MENTION', enabled: true },
  ];

  it('replaces the changed types in place', () => {
    expect(
      withPreferences(preferences, [{ type: 'MENTION', enabled: false }])
    ).toEqual([
      { type: 'ASSIGNMENT', enabled: true },
      { type: 'MENTION', enabled: false },
    ]);
  });

  it('adds a type the list didn’t have', () => {
    expect(
      withPreferences(preferences, [{ type: 'REACTION', enabled: false }])
    ).toEqual([...preferences, { type: 'REACTION', enabled: false }]);
  });
});
