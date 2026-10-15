import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { UndoToastService } from './undo-toast.service';

/** A toast that resolves `onDidDismiss` when it's dismissed. */
function fakeToast() {
  let dismissed: () => void = () => undefined;
  const didDismiss = new Promise<void>((resolve) => (dismissed = resolve));
  return {
    present: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn(() => {
      dismissed();
      return Promise.resolve(true);
    }),
    onDidDismiss: () => didDismiss,
  };
}

describe('UndoToastService', () => {
  let service: UndoToastService;
  let toasts: ReturnType<typeof fakeToast>[];
  let create: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toasts = [];
    create = vi.fn(() => {
      const toast = fakeToast();
      toasts.push(toast);
      return Promise.resolve(toast);
    });
    TestBed.configureTestingModule({
      providers: [{ provide: ToastController, useValue: { create } }],
    });
    service = TestBed.inject(UndoToastService);
  });

  /** The Undo button's handler of the toast created `index`th. */
  function undoButton(index = 0): () => void {
    return create.mock.calls[index][0].buttons[0].handler;
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('offers Undo for 4 s above the anchor', async () => {
    const undo = vi.fn().mockResolvedValue(undefined);

    await service.offer('Moved to Done', 'tab-bar', undo);
    undoButton()();

    expect(create.mock.calls[0][0]).toMatchObject({
      message: 'Moved to Done',
      duration: 4000,
      position: 'bottom',
      positionAnchor: 'tab-bar',
      buttons: [{ text: 'Undo' }],
    });
    expect(toasts[0].present).toHaveBeenCalled();
    expect(undo).toHaveBeenCalled();
  });

  it('runs onExpire when the toast goes without Undo', async () => {
    const onExpire = vi.fn();
    await service.offer('Marked read', 'tab-bar', vi.fn(), onExpire);
    expect(onExpire).not.toHaveBeenCalled();

    // As the 4 s duration ends.
    await toasts[0].dismiss();
    await settle();

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('runs onExpire when the next toast replaces it', async () => {
    const onExpire = vi.fn();
    await service.offer('Marked read', 'tab-bar', vi.fn(), onExpire);

    await service.offer('Marked read', 'tab-bar', vi.fn());
    await settle();

    expect(toasts[0].dismiss).toHaveBeenCalled();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('doesn’t run onExpire after Undo', async () => {
    const onExpire = vi.fn();
    const undo = vi.fn().mockResolvedValue(undefined);
    await service.offer('Marked read', 'tab-bar', undo, onExpire);

    undoButton()();
    await toasts[0].dismiss();
    await settle();

    expect(undo).toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
  });
});
