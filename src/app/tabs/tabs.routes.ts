import { Route, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

/**
 * Task detail, pushed onto whichever tab it was opened from, so back returns
 * to that list. Tasks are project-scoped, hence both ids. `backHref` is where
 * the back button goes when the page is opened directly (a deep link).
 * `under` is the page the rows link from (their link is relative), such as
 * a tab's search page.
 */
function taskDetail(tab: string, under = ''): Route {
  return {
    path: `${under}tasks/:projectId/:taskId`,
    loadComponent: () =>
      import('../pages/tasks/task-detail.page').then((m) => m.TaskDetailPage),
    data: { backHref: `/tabs/${tab}` },
  };
}

// Each tab is its own stack with its own navigation history. The tab names
// here are the `tab` attributes in tabs.page.html.
export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'my-work',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('../pages/my-work/my-work.page').then((m) => m.MyWorkPage),
          },
          taskDetail('my-work'),
          {
            path: 'search',
            loadComponent: () =>
              import('../pages/my-work-search/my-work-search.page').then(
                (m) => m.MyWorkSearchPage
              ),
          },
          taskDetail('my-work', 'search/'),
          // Opened from the My Work avatar: the design has no Settings tab.
          {
            path: 'settings',
            loadComponent: () =>
              import('../pages/settings/settings.page').then(
                (m) => m.SettingsPage
              ),
          },
        ],
      },
      {
        path: 'projects',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('../pages/projects/project-tasks.page').then(
                (m) => m.ProjectTasksPage
              ),
          },
          taskDetail('projects'),
          // The project to search comes as `?project=`.
          {
            path: 'search',
            loadComponent: () =>
              import('../pages/project-search/project-search.page').then(
                (m) => m.ProjectSearchPage
              ),
          },
          taskDetail('projects', 'search/'),
        ],
      },
      {
        path: 'inbox',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('../pages/notifications/notifications.page').then(
                (m) => m.NotificationsPage
              ),
          },
          taskDetail('inbox'),
        ],
      },
      {
        path: '',
        redirectTo: '/tabs/my-work',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/my-work',
    pathMatch: 'full',
  },
];
