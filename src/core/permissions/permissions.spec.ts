import { can, type ProjectAction, type ProjectRole } from './permissions';

const ACTIONS: ProjectAction[] = [
  'read',
  'comment',
  'edit',
  'changeStatus',
  'create',
  'archive',
  'reassign',
  'delete',
];

/** The actions each role may take, as the backend allows them. */
const ALLOWED: Record<ProjectRole, ProjectAction[]> = {
  VIEWER: ['read'],
  COMMENTER: ['read', 'comment'],
  EDITOR: ['read', 'comment', 'edit', 'changeStatus', 'create', 'archive'],
  LEAD: ACTIONS,
  MANAGER: ACTIONS,
};

describe('can', () => {
  for (const [role, allowed] of Object.entries(ALLOWED)) {
    it(`lets ${role} do exactly ${allowed.join(', ')}`, () => {
      expect(ACTIONS.filter((a) => can(role as ProjectRole, a))).toEqual(
        allowed
      );
    });
  }

  it('lets a caller without a role do nothing', () => {
    expect(ACTIONS.filter((a) => can(undefined, a))).toEqual([]);
  });
});
