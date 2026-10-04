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

  it("filters a project's tasks by status, priority, type and label", async () => {
    const keys = async (query: object) =>
      (await api.listProjectTasks('p1', query)).content?.map((t) => t.taskKey);

    expect(await keys({ status: 'todo' })).toEqual(['CHK-150', 'CHK-160']);
    expect(
      await keys({ status: 'todo', excludeLabel: 'ai:candidate' })
    ).toEqual(['CHK-150']);
    expect(await keys({ requireLabel: 'ai:candidate' })).toEqual(['CHK-160']);
    expect(await keys({ priority: 'CRITICAL' })).toEqual(['CHK-142']);
    expect(await keys({ type: 'EPIC' })).toEqual(['CHK-120']);
  });

  it("filters a project's tasks by comma lists, assignee and search", async () => {
    const keys = async (query: object) =>
      (await api.listProjectTasks('p1', query)).content?.map((t) => t.taskKey);

    expect(await keys({ status: 'backlog,done' })).toEqual([
      'CHK-131',
      'CHK-120',
    ]);
    expect(await keys({ priority: 'CRITICAL, LOW' })).toEqual([
      'CHK-142',
      'CHK-131',
    ]);
    expect(await keys({ assigneeId: 'a2' })).toEqual(['CHK-131']);
    expect(await keys({ assigneeId: 'a1,a2' })).toEqual([
      'CHK-142',
      'CHK-150',
      'CHK-131',
    ]);
    expect(await keys({ search: 'safari' })).toEqual(['CHK-142']);
    expect(await keys({ search: 'chk-15' })).toEqual(['CHK-150']);
  });

  it("sorts a project's tasks, missing values last", async () => {
    const keys = async (sort: string) =>
      (await api.listProjectTasks('p1', { sort })).content?.map(
        (t) => t.taskKey
      );

    expect(await keys('taskNumber,asc')).toEqual([
      'CHK-120',
      'CHK-131',
      'CHK-142',
      'CHK-150',
      'CHK-160',
    ]);
    expect(await keys('dueDate,asc')).toEqual([
      'CHK-120',
      'CHK-142',
      'CHK-150',
      'CHK-131',
      'CHK-160',
    ]);
    expect((await keys('priority,desc'))?.slice(0, 1)).toEqual(['CHK-142']);
  });

  it('filters my tasks by status, priority and search', async () => {
    const keys = async (query: object) =>
      (await api.listMyTasks(query)).content?.map((t) => t.taskKey);

    expect(await keys({ status: 'todo' })).toEqual([
      'BIL-88',
      'CHK-150',
      'BIL-90',
    ]);
    expect(await keys({ priority: 'CRITICAL,LOW' })).toEqual([
      'CHK-142',
      'CHK-131',
    ]);
    expect(await keys({ search: 'BIL', openOnly: false })).toEqual([
      'BIL-88',
      'BIL-90',
    ]);
    expect(await keys({ search: 'saved', openOnly: false })).toEqual([
      'CHK-120',
    ]);
  });

  it('lists assignable members', async () => {
    const members = await api.listAssignableMembers('p1');
    expect(members.map((m) => m.accountId)).toEqual(['a2', 'a1', 'a3']);
  });

  it('adds extra project tasks to page through, kept off My Work', async () => {
    api.addProjectTasks('p1', 30, 'in_progress');

    const page = await api.listProjectTasks('p1', {
      status: 'in_progress',
      size: 20,
    });
    expect(page.totalElements).toBe(31);
    expect((await api.listMyTasks({ scope: 'assigned' })).totalElements).toBe(
      5
    );
  });

  it('returns task view settings once set', async () => {
    expect(await api.getTaskViewSettings('p1')).toEqual({});
    api.setTaskViewSettings('p1', { groupBy: 'priority' });
    expect(await api.getTaskViewSettings('p1')).toEqual({
      groupBy: 'priority',
    });
  });

  it('updates task view settings, clearing a field with an empty string', async () => {
    api.setTaskViewSettings('p1', { groupBy: 'priority', aiTaskFilter: 'all' });

    await expect(
      api.updateTaskViewSettings('p1', { groupBy: 'type' })
    ).resolves.toEqual({ groupBy: 'type', aiTaskFilter: 'all' });
    await api.updateTaskViewSettings('p1', { groupBy: '' });
    expect((await api.getTaskViewSettings('p1')).groupBy).toBeUndefined();
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
