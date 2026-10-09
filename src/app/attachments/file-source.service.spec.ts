import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { AlertController, ToastController } from '@ionic/angular';
import { FileSourceService } from './file-source.service';

const camera = vi.hoisted(() => ({
  takePhoto: vi.fn(),
  chooseFromGallery: vi.fn(),
  checkPermissions: vi.fn(),
}));
vi.mock('@capacitor/camera', () => ({ Camera: camera }));
const picker = vi.hoisted(() => ({ pickFiles: vi.fn() }));
vi.mock('@capawesome/capacitor-file-picker', () => ({ FilePicker: picker }));

describe('FileSourceService', () => {
  let alert: { create: ReturnType<typeof vi.fn> };
  let toast: { create: ReturnType<typeof vi.fn> };

  function setup(native: boolean): FileSourceService {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(native);
    alert = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    toast = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AlertController, useValue: alert },
        { provide: ToastController, useValue: toast },
      ],
    });
    return TestBed.inject(FileSourceService);
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('jpeg', { headers: { 'Content-Type': 'image/jpeg' } })
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('offers the camera and photos on native only', () => {
    expect(setup(true).sources).toEqual(['camera', 'photos', 'files']);
    TestBed.resetTestingModule();
    expect(setup(false).sources).toEqual(['files']);
  });

  it('reads a camera photo from its web path, named by the time', async () => {
    const service = setup(true);
    camera.takePhoto.mockResolvedValue({
      webPath: 'https://localhost/_capacitor_file_/cache/123.jpg',
    });

    const picked = await service.pick('camera');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://localhost/_capacitor_file_/cache/123.jpg'
    );
    expect(picked?.name).toMatch(/^photo-\d{8}-\d{6}\.jpg$/);
    expect(await picked?.blob.text()).toBe('jpeg');
  });

  it('takes the first photo chosen from the library', async () => {
    const service = setup(true);
    camera.chooseFromGallery.mockResolvedValue({
      results: [{ webPath: 'capacitor://localhost/_capacitor_file_/a.jpeg' }],
    });

    const picked = await service.pick('photos');
    expect(picked?.name).toMatch(/^photo-.*\.jpeg$/);
  });

  it('explains how to turn a denied permission back on', async () => {
    const service = setup(true);
    camera.takePhoto.mockRejectedValue(new Error('User denied access'));
    camera.checkPermissions.mockResolvedValue({
      camera: 'denied',
      photos: 'granted',
    });

    await expect(service.pick('camera')).resolves.toBeUndefined();
    expect(alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Flux can’t use the camera. Turn on Camera for Flux in Settings.',
      })
    );
  });

  it('says nothing when the user backs out', async () => {
    const service = setup(true);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    camera.chooseFromGallery.mockRejectedValue(new Error('User cancelled'));
    camera.checkPermissions.mockResolvedValue({
      camera: 'granted',
      photos: 'granted',
    });

    await expect(service.pick('photos')).resolves.toBeUndefined();
    expect(alert.create).not.toHaveBeenCalled();
    expect(toast.create).not.toHaveBeenCalled();
  });

  it('uses the blob the file picker hands back on web', async () => {
    const service = setup(false);
    const blob = new Blob(['%PDF']);
    picker.pickFiles.mockResolvedValue({
      files: [{ name: 'spec.pdf', blob, mimeType: 'application/pdf', size: 4 }],
    });

    await expect(service.pick('files')).resolves.toEqual({
      name: 'spec.pdf',
      blob,
    });
    expect(picker.pickFiles).toHaveBeenCalledWith({ limit: 1 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reads a native pick from the path the WebView serves', async () => {
    const service = setup(true);
    picker.pickFiles.mockResolvedValue({
      files: [
        {
          name: 'log.txt',
          webPath: 'https://localhost/_capacitor_file_/log.txt',
          mimeType: 'text/plain',
          size: 4,
        },
      ],
    });

    const picked = await service.pick('files');
    expect(picked?.name).toBe('log.txt');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://localhost/_capacitor_file_/log.txt'
    );
  });

  it('says so when the picked file can’t be read', async () => {
    const service = setup(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('gone'));
    picker.pickFiles.mockResolvedValue({
      files: [{ name: 'a.txt', webPath: 'x', mimeType: '', size: 1 }],
    });

    await expect(service.pick('files')).resolves.toBeUndefined();
    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Couldn’t read that file.' })
    );
  });

  it('treats a cancelled file picker as nothing picked', async () => {
    const service = setup(false);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    picker.pickFiles.mockRejectedValue(new Error('pickFiles canceled.'));
    await expect(service.pick('files')).resolves.toBeUndefined();
  });
});
