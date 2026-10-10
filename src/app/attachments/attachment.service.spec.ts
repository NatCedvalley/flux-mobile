import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { ToastController } from '@ionic/angular';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { FLUX_API } from '../providers/flux-api.token';
import { AttachmentService } from './attachment.service';

const browser = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@capacitor/browser', () => ({ Browser: browser }));

describe('AttachmentService', () => {
  let api: InMemoryFluxApi;
  let toast: { create: ReturnType<typeof vi.fn> };
  let service: AttachmentService;
  const target = { projectId: 'p1', taskId: '1', anchor: 'bar' };
  const lastToast = () => toast.create.mock.calls.at(-1)?.[0];

  beforeEach(() => {
    api = new InMemoryFluxApi();
    toast = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    TestBed.configureTestingModule({
      providers: [
        { provide: FLUX_API, useValue: api },
        { provide: ToastController, useValue: toast },
      ],
    });
    service = TestBed.inject(AttachmentService);
    browser.open.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it('uploads the file and says so above the anchor', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    const added = await service.upload(target, { name: 'shot.png', blob });

    expect(added?.fileName).toBe('shot.png');
    expect(lastToast()).toMatchObject({
      message: 'Attached shot.png',
      positionAnchor: 'bar',
    });
  });

  it('shows the server’s message when the file is refused', async () => {
    const refused = await service.upload(target, {
      name: 'photo.heic',
      blob: new Blob(['x']),
    });

    expect(refused).toBeUndefined();
    expect(lastToast().message).toContain("'heic' files are not allowed.");
  });

  it('explains a 413, which has no message', async () => {
    vi.spyOn(api, 'uploadTaskAttachment').mockRejectedValue(new ApiError(413));
    await service.upload(target, { name: 'big.mov', blob: new Blob(['x']) });
    expect(lastToast().message).toBe('This file is too large to upload.');
  });

  it('opens the preview in the in-app browser on native', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    await service.open({ previewUrl: 'https://files.test/f1' });
    expect(browser.open).toHaveBeenCalledWith({ url: 'https://files.test/f1' });
  });

  it('opens the preview in a new tab on web', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await service.open({ previewUrl: 'https://files.test/f1' });
    expect(open).toHaveBeenCalledWith(
      'https://files.test/f1',
      '_blank',
      'noopener'
    );
    expect(browser.open).not.toHaveBeenCalled();
  });

  it('says so when the server couldn’t sign a URL', async () => {
    await service.open({ previewUrl: undefined }, 'bar');
    expect(lastToast()).toMatchObject({
      message: 'This file isn’t available right now.',
      positionAnchor: 'bar',
    });
    expect(browser.open).not.toHaveBeenCalled();
  });
});
