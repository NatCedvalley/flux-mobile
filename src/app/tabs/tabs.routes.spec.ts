import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  provideRouter,
  withComponentInputBinding,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AlertController, provideIonicAngular } from '@ionic/angular';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { AuthService } from '../auth/auth.service';
import { AppLockService } from '../lock/app-lock.service';
import { MyWorkSearchPage } from '../pages/my-work-search/my-work-search.page';
import { ProjectSearchPage } from '../pages/project-search/project-search.page';
import { SettingsPage } from '../pages/settings/settings.page';
import { TaskDetailPage } from '../pages/tasks/task-detail.page';
import { FLUX_API } from '../providers/flux-api.token';
import { routes } from './tabs.routes';

describe('tab routes', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        // Ionic's outlets bind route data to inputs only with its binder.
        provideIonicAngular(),
        provideRouter(routes, withComponentInputBinding()),
        { provide: FLUX_API, useClass: InMemoryFluxApi },
        { provide: AuthService, useValue: { account: signal(null) } },
        { provide: AlertController, useValue: {} },
        {
          provide: AppLockService,
          useValue: { available: signal(false), enabled: signal(false) },
        },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  /** The component the innermost outlet rendered for `url`. */
  async function open(url: string): Promise<unknown> {
    await harness.navigateByUrl(url);
    let route = TestBed.inject(Router).routerState.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route.component;
  }

  it('opens My Work by default', async () => {
    await open('/');

    expect(TestBed.inject(Router).url).toBe('/tabs/my-work');
  });

  it.each(['my-work', 'projects', 'inbox'])(
    'routes task detail under the %s tab, with back leading to it',
    async (tab) => {
      expect(await open(`/tabs/${tab}/tasks/p1/1`)).toBe(TaskDetailPage);

      const route = TestBed.inject(Router).routerState.snapshot.root;
      let leaf = route;
      while (leaf.firstChild) {
        leaf = leaf.firstChild;
      }
      expect(leaf.params).toEqual({ projectId: 'p1', taskId: '1' });
      expect(leaf.data['backHref']).toBe(`/tabs/${tab}`);
    }
  );

  it('opens the search pages within their tabs', async () => {
    expect(await open('/tabs/my-work/search')).toBe(MyWorkSearchPage);
    expect(await open('/tabs/projects/search?project=p1')).toBe(
      ProjectSearchPage
    );
  });

  it.each(['my-work', 'projects'])(
    'routes task detail under the %s search page, with back leading to the tab',
    async (tab) => {
      expect(await open(`/tabs/${tab}/search/tasks/p1/1`)).toBe(TaskDetailPage);

      let leaf = TestBed.inject(Router).routerState.snapshot.root;
      while (leaf.firstChild) {
        leaf = leaf.firstChild;
      }
      expect(leaf.params).toEqual({ projectId: 'p1', taskId: '1' });
      expect(leaf.data['backHref']).toBe(`/tabs/${tab}`);
    }
  );

  it('opens Settings within the My Work stack', async () => {
    expect(await open('/tabs/my-work/settings')).toBe(SettingsPage);
  });
});
