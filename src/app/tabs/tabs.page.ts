import {
  Component,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  afterNextRender,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import {
  IonBadge,
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular';
import { filter, map } from 'rxjs';
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
  private readonly router = inject(Router);
  /**
   * Whether the page showing covers the tab bar (route data `coversTabBar`,
   * task detail). It covers it by layout (global.scss); this only keeps
   * screen readers out of the hidden bar.
   */
  protected readonly covered = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.coversTabBar())
    ),
    { initialValue: this.coversTabBar() }
  );

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    // Task detail reaches down over the tab bar by its height, which
    // changes with the safe area and text size, and is 0 while Ionic hides
    // the bar for the keyboard.
    afterNextRender(() => {
      const bar = host.querySelector<HTMLElement>('ion-tab-bar');
      const measure = () =>
        host.style.setProperty(
          '--flux-tab-bar-height',
          `${bar?.offsetHeight ?? 0}px`
        );
      const observer =
        typeof ResizeObserver === 'undefined'
          ? undefined
          : new ResizeObserver(measure);
      // The border box: the safe area is the bar's padding.
      if (bar) {
        observer?.observe(bar, { box: 'border-box' });
      }
      measure();
      destroyRef.onDestroy(() => observer?.disconnect());
    });
  }

  private coversTabBar(): boolean {
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route.data['coversTabBar'] === true;
  }
}
