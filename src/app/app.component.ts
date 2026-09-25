import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { AppLockService } from './lock/app-lock.service';
import { LockScreenComponent } from './lock/lock-screen.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, LockScreenComponent],
})
export class AppComponent {
  /** While locked, the lock screen covers the app and the app is inert. */
  protected readonly locked = inject(AppLockService).locked;
}
