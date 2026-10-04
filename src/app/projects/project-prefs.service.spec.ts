import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { ProjectPrefsService } from './project-prefs.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: vi.fn(), set: vi.fn() },
}));

describe('ProjectPrefsService', () => {
  let stored: Record<string, string>;
  let service: ProjectPrefsService;

  beforeEach(() => {
    vi.clearAllMocks();
    stored = {};
    vi.mocked(Preferences.get).mockImplementation(({ key }) =>
      Promise.resolve({ value: stored[key] ?? null })
    );
    vi.mocked(Preferences.set).mockImplementation(({ key, value }) => {
      stored[key] = value;
      return Promise.resolve();
    });
    service = TestBed.inject(ProjectPrefsService);
  });

  it('loads the pinned projects once', async () => {
    stored['projects.pinned'] = '["p2","p1"]';

    await Promise.all([service.load(), service.load()]);

    expect(service.pinned()).toEqual(['p2', 'p1']);
    expect(Preferences.get).toHaveBeenCalledTimes(1);
  });

  it('starts with no pins when nothing, or garbage, is stored', async () => {
    stored['projects.pinned'] = '{"not":"a list"}';
    await service.load();
    expect(service.pinned()).toEqual([]);
  });

  it('pins and unpins a project, and stores the change', async () => {
    await service.load();

    await service.togglePin('p1');
    await service.togglePin('p2');
    expect(service.pinned()).toEqual(['p1', 'p2']);

    await service.togglePin('p1');
    expect(service.pinned()).toEqual(['p2']);
    expect(stored['projects.pinned']).toBe('["p2"]');
  });

  it('remembers the last project', async () => {
    expect(await service.lastProjectId()).toBeNull();

    await service.setLastProject('p2');

    expect(await service.lastProjectId()).toBe('p2');
  });

  it('treats a failed read as no stored value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(Preferences.get).mockRejectedValue(new Error('broken'));

    await service.load();

    expect(service.pinned()).toEqual([]);
    expect(await service.lastProjectId()).toBeNull();
  });
});
