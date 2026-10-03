import { InMemoryFluxApi } from './in-memory-flux-api';

const TODAY = new Date(2026, 9, 1);

describe('InMemoryFluxApi', () => {
  let api: InMemoryFluxApi;

  beforeEach(() => {
    api = new InMemoryFluxApi(TODAY);
  });

  it('lists open assigned tasks by priority, then due date', async () => {
    const page = await api.listMyTasks({ scope: 'assigned', openOnly: true });
    expect(page.content?.map((t) => t.taskKey)).toEqual([
      'CHK-142',
      'BIL-88',
      'CHK-150',
      'BIL-90',
      'CHK-131',
    ]);
    expect(page.totalElements).toBe(5);
  });

  it('applies the due window', async () => {
    const page = await api.listMyTasks({ dueDateTo: '2026-10-01' });
    expect(page.content?.map((t) => t.dueDate)).toEqual([
      '2026-09-30',
      '2026-10-01',
    ]);
  });

  it('lists watched tasks separately', async () => {
    const page = await api.listMyTasks({ scope: 'watching' });
    expect(page.content?.map((t) => t.taskKey)).toEqual(['BIL-75']);
  });

  it('includes done tasks when openOnly is false', async () => {
    const page = await api.listMyTasks({ openOnly: false });
    expect(page.content?.some((t) => t.statusCategory === 'DONE')).toBe(true);
  });

  it('pages results', async () => {
    const page = await api.listMyTasks({ page: 1, size: 2 });
    expect(page.content).toHaveLength(2);
    expect(page).toMatchObject({ page: 1, totalPages: 3, last: false });
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

  it("lists a project's tasks", async () => {
    const page = await api.listProjectTasks('p2');
    expect(page.content?.every((t) => t.projectId === 'p2')).toBe(true);
  });

  it('lists projects and workflow statuses', async () => {
    expect((await api.listMyProjects()).content).toHaveLength(2);
    const statuses = await api.listWorkflowStatuses('p1');
    expect(statuses.map((s) => s.category)).toEqual([
      'PLANNING',
      'TODO',
      'IN_PROGRESS',
      'DONE',
    ]);
  });

  it('lists notifications, optionally only unread ones', async () => {
    expect((await api.listNotifications()).content).toHaveLength(3);
    expect(
      (await api.listNotifications({ isRead: false })).content
    ).toHaveLength(2);
  });
});
