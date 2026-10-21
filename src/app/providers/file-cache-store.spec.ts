import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { FileCacheStore } from './file-cache-store';

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    rmdir: vi.fn(),
  },
}));

describe('FileCacheStore', () => {
  const store = new FileCacheStore();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a UTF-8 file in the Cache directory', async () => {
    await store.write('index.json', '{}');

    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'flux-cache/index.json',
      data: '{}',
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  });

  it('reads a file back', async () => {
    vi.mocked(Filesystem.readFile).mockResolvedValue({ data: '{"a":1}' });

    expect(await store.read('index.json')).toBe('{"a":1}');
    expect(Filesystem.readFile).toHaveBeenCalledWith({
      path: 'flux-cache/index.json',
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
  });

  it('reads a missing file as undefined', async () => {
    vi.mocked(Filesystem.readFile).mockRejectedValue(
      new Error('File does not exist')
    );

    expect(await store.read('gone.json')).toBeUndefined();
  });

  it('removes a file, missing or not', async () => {
    vi.mocked(Filesystem.deleteFile).mockRejectedValue(new Error('missing'));

    await expect(store.remove('gone.json')).resolves.toBeUndefined();
    expect(Filesystem.deleteFile).toHaveBeenCalledWith({
      path: 'flux-cache/gone.json',
      directory: Directory.Cache,
    });
  });

  it('clears by removing the whole folder', async () => {
    vi.mocked(Filesystem.rmdir).mockRejectedValue(new Error('missing'));

    await expect(store.clear()).resolves.toBeUndefined();
    expect(Filesystem.rmdir).toHaveBeenCalledWith({
      path: 'flux-cache',
      directory: Directory.Cache,
      recursive: true,
    });
  });
});
