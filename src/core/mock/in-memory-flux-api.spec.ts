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

  it('gets a task by project and id', async () => {
    const task = await api.getTask('p1', '1');
    expect(task.id).toBe('1');
  });

  it('rejects for an unknown task id', async () => {
    await expect(api.getTask('p1', 'does-not-exist')).rejects.toThrow(
      'Task not found: p1/does-not-exist'
    );
  });

  it('rejects a task asked for under another project', async () => {
    await expect(api.getTask('p2', '1')).rejects.toThrow(
      'Task not found: p2/1'
    );
  });

  it('lists fixture notifications', async () => {
    const notifications = await api.listNotifications();
    expect(notifications.length).toBeGreaterThan(0);
  });
});
