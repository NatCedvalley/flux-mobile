import { Preferences } from '@capacitor/preferences';
import { PreferencesStore } from './preferences-store';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    keys: vi.fn(),
  },
}));

describe('PreferencesStore', () => {
  const store = new PreferencesStore();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a blob under its prefixed key', async () => {
    await store.write('write-queue.a1.json', '{}');

    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'write-queue/write-queue.a1.json',
      value: '{}',
    });
  });

  it('reads a blob back, or undefined when there is none', async () => {
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: '{"a":1}' });
    expect(await store.read('b')).toBe('{"a":1}');
    expect(Preferences.get).toHaveBeenCalledWith({ key: 'write-queue/b' });

    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: null });
    expect(await store.read('b')).toBeUndefined();

    vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('nope'));
    expect(await store.read('b')).toBeUndefined();
  });

  it('removes a blob', async () => {
    await store.remove('b');

    expect(Preferences.remove).toHaveBeenCalledWith({ key: 'write-queue/b' });
  });

  it('clears only its own keys', async () => {
    vi.mocked(Preferences.keys).mockResolvedValue({
      keys: ['write-queue/a', 'projects.pinned', 'write-queue/b'],
    });

    await store.clear();

    expect(Preferences.remove).toHaveBeenCalledTimes(2);
    expect(Preferences.remove).toHaveBeenCalledWith({ key: 'write-queue/a' });
    expect(Preferences.remove).toHaveBeenCalledWith({ key: 'write-queue/b' });
  });
});
