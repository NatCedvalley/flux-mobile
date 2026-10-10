import { Injectable, inject } from '@angular/core';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { AlertController, ToastController } from '@ionic/angular';

/** Where a file to attach comes from. */
export type FileSource = 'camera' | 'files' | 'photos';

/** A file the user picked, ready to upload. */
export type PickedFile = { name: string; blob: Blob };

/** What each source is called, and its icon, in the source lists. */
export const FILE_SOURCES: Record<FileSource, { label: string; icon: string }> =
  {
    camera: { label: 'Take photo', icon: 'camera' },
    photos: { label: 'Choose photo', icon: 'image' },
    files: { label: 'Choose file', icon: 'file-text' },
  };

/** What a denied permission says, and where to turn it back on. */
const DENIED: Record<'camera' | 'photos', string> = {
  camera: 'Flux can’t use the camera. Turn on Camera for Flux in Settings.',
  photos: 'Flux can’t open your photos. Turn on Photos for Flux in Settings.',
};

/**
 * Picks a file to attach: a photo from the camera or the photo library
 * (both JPEG, so never the HEIC the server refuses), or any file from the
 * system file picker. Resolves `undefined` when the user cancels. If the
 * camera or photos permission is denied, an alert says how to turn it on.
 * On web only the file picker is offered; it reaches images too.
 */
@Injectable({ providedIn: 'root' })
export class FileSourceService {
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);

  /** The sources this platform offers, in the order the lists show them. */
  readonly sources: readonly FileSource[] = Capacitor.isNativePlatform()
    ? ['camera', 'photos', 'files']
    : ['files'];

  pick(source: FileSource): Promise<PickedFile | undefined> {
    switch (source) {
      case 'camera':
        return this.photo('camera');
      case 'photos':
        return this.photo('photos');
      case 'files':
        return this.file();
    }
  }

  private async photo(
    source: 'camera' | 'photos'
  ): Promise<PickedFile | undefined> {
    let webPath: string | undefined;
    try {
      // The plugin asks for the permission it needs itself.
      const result =
        source === 'camera'
          ? await Camera.takePhoto({ quality: 80 })
          : (await Camera.chooseFromGallery({ quality: 80 })).results[0];
      webPath = result?.webPath;
    } catch (error) {
      if (await this.denied(source)) {
        await this.explain(source);
      } else {
        // Most often the user backed out.
        console.warn(`No photo from ${source}`, error);
      }
      return undefined;
    }
    if (!webPath) {
      return undefined;
    }
    const blob = await this.read(webPath);
    return blob && { name: photoName(webPath), blob };
  }

  private async file(): Promise<PickedFile | undefined> {
    let picked;
    try {
      picked = (await FilePicker.pickFiles({ limit: 1 })).files[0];
    } catch (error) {
      // Cancelling rejects too.
      console.warn('No file picked', error);
      return undefined;
    }
    if (!picked) {
      return undefined;
    }
    // Web hands back the blob; native, a path the WebView serves.
    const blob =
      picked.blob ??
      (await this.read(
        picked.webPath ?? Capacitor.convertFileSrc(picked.path ?? '')
      ));
    return blob && { name: picked.name, blob };
  }

  /**
   * The picked file's bytes. Its URL is under the WebView's own origin, so
   * this fetch bypasses CapacitorHttp.
   */
  private async read(url: string): Promise<Blob | undefined> {
    try {
      return await (await fetch(url)).blob();
    } catch (error) {
      console.error('Reading the picked file failed', error);
      const toast = await this.toasts.create({
        message: 'Couldn’t read that file.',
        duration: 3000,
        position: 'bottom',
      });
      await toast.present();
      return undefined;
    }
  }

  private async denied(source: 'camera' | 'photos'): Promise<boolean> {
    try {
      return (await Camera.checkPermissions())[source] === 'denied';
    } catch {
      return false;
    }
  }

  private async explain(source: 'camera' | 'photos'): Promise<void> {
    const alert = await this.alerts.create({
      header:
        source === 'camera' ? 'Camera access is off' : 'Photo access is off',
      message: DENIED[source],
      buttons: ['OK'],
    });
    await alert.present();
  }
}

/** `photo-20261009-142233.jpg`, keeping the extension the plugin wrote. */
function photoName(webPath: string, now = new Date()): string {
  const ext = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(webPath)?.[1]?.toLowerCase();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `photo-${stamp}.${ext ?? 'jpg'}`;
}
