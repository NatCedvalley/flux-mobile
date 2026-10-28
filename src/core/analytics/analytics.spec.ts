import { SCREEN_NAME_MAX, screenName } from './analytics';

describe('screenName', () => {
  it('joins the route patterns, skipping empty paths', () => {
    expect(
      screenName([
        undefined,
        '',
        'tabs',
        'inbox',
        '',
        'tasks/:projectId/:taskId',
      ])
    ).toBe('tabs/inbox/tasks/:projectId/:taskId');
  });

  it('names a route under search', () => {
    expect(
      screenName(['', 'tabs', 'projects', 'search/tasks/:projectId/:taskId'])
    ).toBe('tabs/projects/search/tasks/:projectId/:taskId');
  });

  it('is empty for the root', () => {
    expect(screenName([undefined, ''])).toBe('');
  });

  it("caps the name at Firebase's limit", () => {
    expect(screenName(['a'.repeat(80), 'b'.repeat(80)])).toHaveLength(
      SCREEN_NAME_MAX
    );
  });
});
