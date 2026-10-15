import { Component, EnvironmentInjector, inject } from '@angular/core';
import {
  IonBadge,
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular';
import { InboxService } from '../inbox/inbox.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
  /** The Inbox badge's count; hidden at 0 and until loaded. */
  protected readonly unread = inject(InboxService).unread;
}
