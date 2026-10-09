import { Component, input, output } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonFooter,
  IonIcon,
  IonToolbar,
} from '@ionic/angular';

/**
 * The create sheet's own accessory bar (3i; iOS's native one is hidden
 * while the sheet is open): the paperclip and, on native, the camera,
 * always, and Done while the keyboard is up.
 */
@Component({
  selector: 'app-accessory-bar',
  templateUrl: './accessory-bar.component.html',
  styleUrls: ['./accessory-bar.component.scss'],
  imports: [IonFooter, IonToolbar, IonButtons, IonButton, IonIcon],
})
export class AccessoryBarComponent {
  readonly keyboardOpen = input(false);
  readonly canTakePhoto = input(false);

  readonly attach = output();
  readonly camera = output();
  readonly done = output();
}
