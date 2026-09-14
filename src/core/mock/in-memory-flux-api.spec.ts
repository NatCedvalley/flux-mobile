import { InMemoryFluxApi } from './in-memory-flux-api';

describe('InMemoryFluxApi', () => {
  let api: InMemoryFluxApi;

  beforeEach(() => {
    api = new InMemoryFluxApi();
  });

  it('lists fixture tasks', async () => {
    const tasks = await api.listTasks();
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('gets a task by id', async () => {
    const task = await api.getTask('1');
    expect(task.id).toBe('1');
  });

  it('rejects for an unknown task id', async () => {
    await expect(api.getTask('does-not-exist')).rejects.toThrow(
      'Task not found: does-not-exist'
    );
  });

  it('lists fixture notifications', async () => {
    const notifications = await api.listNotifications();
    expect(notifications.length).toBeGreaterThan(0);
  });
});
