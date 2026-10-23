import { Component, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { buildInfo } from '../../../environments/build-info';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
  ],
})
export class AboutPage {
  protected readonly version = buildInfo.version;
  protected readonly commit = buildInfo.commit;
  protected readonly environmentName = environment.name;
  /**
   * The native build number (Android's versionCode, iOS's CFBundleVersion).
   * Web has none, so the row stays hidden there.
   */
  protected readonly build = signal<string | undefined>(undefined);

  constructor() {
    if (Capacitor.isNativePlatform()) {
      void App.getInfo().then((info) => this.build.set(info.build));
    }
  }

  /** In the in-app browser on native, a new tab on web. */
  protected async openPrivacyPolicy(): Promise<void> {
    const url = environment.privacyPolicyUrl;
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }
}
