import { Routes } from '@angular/router';

// Nested under the 'tasks' tab so this stack has its own navigation history,
// separate from the Notifications and Settings tabs.
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./task-list.page').then((m) => m.TaskListPage),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./task-detail.page').then((m) => m.TaskDetailPage),
  },
];
