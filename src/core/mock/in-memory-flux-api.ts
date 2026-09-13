import type { AppNotification, FluxApi, Task } from '../api';

const TASKS: Task[] = [
  {
    id: '1',
    title: 'Draft Q3 roadmap',
    description: 'Outline priorities for the next quarter.',
    status: 'in_progress',
    dueDate: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-12T09:00:00.000Z',
  },
  {
    id: '2',
    title: 'Review pull request #482',
    status: 'todo',
    dueDate: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-11T15:30:00.000Z',
  },
  {
    id: '3',
    title: 'Fix login redirect bug',
    description: 'Repro only happens on expired sessions.',
    status: 'todo',
    updatedAt: '2026-09-10T11:00:00.000Z',
  },
  {
    id: '4',
    title: 'Write onboarding docs',
    status: 'done',
    updatedAt: '2026-09-08T17:45:00.000Z',
  },
  {
    id: '5',
    title: 'Prepare release notes',
    status: 'in_progress',
    dueDate: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-12T08:15:00.000Z',
  },
];

const NOTIFICATIONS: AppNotification[] = [
  {
    id: '1',
    title: 'Task assigned to you',
    body: "You were assigned 'Draft Q3 roadmap'.",
    createdAt: '2026-09-12T09:00:00.000Z',
    read: false,
    taskId: '1',
  },
  {
    id: '2',
    title: 'Comment on your task',
    body: "New comment on 'Review pull request #482'.",
    createdAt: '2026-09-11T16:00:00.000Z',
    read: false,
    taskId: '2',
  },
  {
    id: '3',
    title: 'Task completed',
    body: "'Write onboarding docs' was marked done.",
    createdAt: '2026-09-08T17:45:00.000Z',
    read: true,
    taskId: '4',
  },
];

/**
 * Static in-memory `FluxApi` implementation. Lets the placeholder pages
 * render real-shaped data before the app has a network layer. Not intended
 * as a long-term fixture/testing strategy.
 */
export class InMemoryFluxApi implements FluxApi {
  listTasks(): Promise<Task[]> {
    return Promise.resolve(TASKS);
  }

  getTask(id: string): Promise<Task> {
    const task = TASKS.find((t) => t.id === id);
    if (!task) {
      return Promise.reject(new Error(`Task not found: ${id}`));
    }
    return Promise.resolve(task);
  }

  listNotifications(): Promise<AppNotification[]> {
    return Promise.resolve(NOTIFICATIONS);
  }
}
