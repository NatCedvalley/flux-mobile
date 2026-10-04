import type { MyProject } from '../api';
import {
  initialProject,
  priorityFact,
  projectDue,
  projectInitials,
  projectSubline,
  switcherGroups,
} from './display';

const TODAY = '2026-10-01';

function project(
  id: string,
  name: string,
  key: string,
  extra: Partial<MyProject> = {}
): MyProject {
  return { project: { id, name, projectKey: key }, ...extra };
}

const PROJECTS = [
  project('a', 'Billing', 'BIL'),
  project('b', 'Checkout', 'CHK'),
  project('c', 'Data', 'DAT'),
];

describe('priorityFact', () => {
  it('gives each priority its icon and word', () => {
    expect(priorityFact('CRITICAL')).toEqual({
      icon: 'chevrons-up',
      label: 'Critical',
      level: 'CRITICAL',
    });
    expect(priorityFact('HIGH')?.icon).toBe('arrow-up');
    expect(priorityFact('MEDIUM')?.icon).toBe('minus');
    expect(priorityFact('LOW')?.icon).toBe('arrow-down');
    expect(priorityFact(undefined)).toBeNull();
  });
});

describe('projectDue', () => {
  it('says when a task is due', () => {
    expect(projectDue({ dueDate: TODAY }, TODAY)).toEqual({
      label: 'Due today',
      overdue: false,
    });
    expect(projectDue({ dueDate: '2026-10-08' }, TODAY).label).toBe(
      'Thu 8 Oct'
    );
  });

  it('marks an open task past its date as overdue', () => {
    expect(projectDue({ dueDate: '2026-09-30' }, TODAY)).toEqual({
      label: 'Due yesterday',
      overdue: true,
    });
  });

  it('never marks a done task overdue', () => {
    expect(
      projectDue({ dueDate: '2026-09-30', statusCategory: 'DONE' }, TODAY)
        .overdue
    ).toBe(false);
  });

  it('says so when there is no due date', () => {
    expect(projectDue({}, TODAY)).toEqual({
      label: 'No due date',
      overdue: false,
    });
  });
});

describe('projectSubline', () => {
  it('shows the role and open count, and overdue only when there are any', () => {
    expect(
      projectSubline({ role: 'EDITOR', openCount: 24, overdueCount: 2 })
    ).toBe('Editor · 24 open · 2 overdue');
    expect(
      projectSubline({ role: 'LEAD', openCount: 16, overdueCount: 0 })
    ).toBe('Lead · 16 open');
  });

  it('calls a viewer read-only', () => {
    expect(projectSubline({ role: 'VIEWER', openCount: 3 })).toBe(
      'Viewer · read-only'
    );
  });
});

describe('projectInitials', () => {
  it('uses the start of the key, else the name', () => {
    expect(projectInitials({ projectKey: 'cedte', name: 'Checkout' })).toBe(
      'CE'
    );
    expect(projectInitials({ name: 'Data platform' })).toBe('DP');
    expect(projectInitials(undefined)).toBe('?');
  });
});

describe('switcherGroups', () => {
  it('lists pinned projects first and not again below', () => {
    const { pinned, others } = switcherGroups(PROJECTS, ['c']);
    expect(pinned.map((p) => p.project?.id)).toEqual(['c']);
    expect(others.map((p) => p.project?.id)).toEqual(['a', 'b']);
  });

  it('searches names and keys, ignoring case', () => {
    expect(
      switcherGroups(PROJECTS, [], 'chk').others.map((p) => p.project?.id)
    ).toEqual(['b']);
    expect(
      switcherGroups(PROJECTS, ['c'], ' dat ').pinned.map((p) => p.project?.id)
    ).toEqual(['c']);
  });
});

describe('initialProject', () => {
  it('reopens the last project used', () => {
    expect(initialProject(PROJECTS, 'b', ['c'])?.project?.id).toBe('b');
  });

  it('falls back to the first pinned project, then the first one', () => {
    expect(initialProject(PROJECTS, 'gone', ['x', 'c'])?.project?.id).toBe('c');
    expect(initialProject(PROJECTS, null, [])?.project?.id).toBe('a');
    expect(initialProject([], null, [])).toBeUndefined();
  });
});
