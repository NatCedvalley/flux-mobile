import { ApiError } from '../auth/api-error';
import { HttpFluxApi, type WithAccessToken } from './http-flux-api';

const BASE_URL = 'http://ops.test/api/v1';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Hands every call the same token, like a live session. */
const withToken: WithAccessToken = (call) => call('a1');

function setup(body: unknown = {}, status = 200) {
  const fetchFn = vi.fn().mockResolvedValue(jsonResponse(status, body));
  const api = new HttpFluxApi(BASE_URL, withToken, fetchFn);
  const url = () => fetchFn.mock.calls[0][0] as string;
  const init = () => fetchFn.mock.calls[0][1];
  return { api, fetchFn, url, init };
}

describe('HttpFluxApi', () => {
  it('lists my tasks with the query and a Bearer token', async () => {
    const page = { content: [{ id: 't1' }], totalElements: 1 };
    const { api, url, init } = setup(page);

    await expect(
      api.listMyTasks({
        scope: 'assigned',
        openOnly: true,
        dueDateTo: '2026-10-08',
        size: 100,
      })
    ).resolves.toEqual(page);

    expect(url()).toBe(
      `${BASE_URL}/dashboard/my-tasks?scope=assigned&openOnly=true&dueDateTo=2026-10-08&size=100`
    );
    expect(init().method).toBe('GET');
    expect(init().headers.Authorization).toBe('Bearer a1');
  });

  it('lists a project’s tasks with a sort', async () => {
    const { api, url } = setup({ content: [] });
    await api.listProjectTasks('p 1', { sort: 'dueDate,asc', page: 2 });

    expect(url()).toBe(
      `${BASE_URL}/projects/p%201/tasks?sort=dueDate%2Casc&page=2`
    );
  });

  it('gets a task under its project', async () => {
    const { api, url } = setup({ id: 't1' });
    await expect(api.getTask('p1', 't1')).resolves.toEqual({ id: 't1' });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1`);
  });

  it('lists my projects', async () => {
    const { api, url } = setup({ content: [] });
    await api.listMyProjects();
    expect(url()).toBe(`${BASE_URL}/projects/mine`);
  });

  it('lists my projects with the time zone for overdue counts', async () => {
    const { api, url } = setup({ content: [] });
    await api.listMyProjects({ tz: 'Asia/Kuala_Lumpur', size: 100 });
    expect(url()).toBe(
      `${BASE_URL}/projects/mine?tz=Asia%2FKuala_Lumpur&size=100`
    );
  });

  it('gets a project’s task view settings', async () => {
    const { api, url } = setup({ groupBy: 'priority' });
    await expect(api.getTaskViewSettings('p1')).resolves.toEqual({
      groupBy: 'priority',
    });
    expect(url()).toBe(`${BASE_URL}/projects/p1/task-view-settings`);
  });

  it('PUTs a change to the caller’s task view settings', async () => {
    const { api, url, init } = setup({ groupBy: 'type' });
    await expect(
      api.updateTaskViewSettings('p1', { groupBy: 'type' })
    ).resolves.toEqual({ groupBy: 'type' });

    expect(url()).toBe(`${BASE_URL}/projects/p1/task-view-settings`);
    expect(init().method).toBe('PUT');
    expect(init().headers.Authorization).toBe('Bearer a1');
    expect(JSON.parse(init().body)).toEqual({ groupBy: 'type' });
  });

  it('lists a project’s assignable members', async () => {
    const { api, url } = setup([{ accountId: 'a1' }]);
    await expect(api.listAssignableMembers('p1')).resolves.toEqual([
      { accountId: 'a1' },
    ]);
    expect(url()).toBe(`${BASE_URL}/projects/p1/members/assignable`);
  });

  it('lists a project’s workflow statuses', async () => {
    const { api, url } = setup([{ slug: 'todo' }]);
    await expect(api.listWorkflowStatuses('p1')).resolves.toEqual([
      { slug: 'todo' },
    ]);
    expect(url()).toBe(`${BASE_URL}/projects/p1/workflow-statuses`);
  });

  it('lists a task’s children', async () => {
    const { api, url } = setup([{ id: 't2' }]);
    await expect(api.listChildTasks('p1', 't 1')).resolves.toEqual([
      { id: 't2' },
    ]);
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t%201/children`);
  });

  it('lists a task’s activities a page at a time', async () => {
    const { api, url } = setup({ content: [] });
    await api.listTaskActivities('p1', 't1', { page: 1, size: 50 });
    expect(url()).toBe(
      `${BASE_URL}/projects/p1/tasks/t1/activities?page=1&size=50`
    );
  });

  it('lists a task’s comments a page at a time', async () => {
    const { api, url } = setup({ content: [] });
    await api.listTaskComments('p1', 't1', { size: 100 });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/comments?size=100`);
  });

  it('posts a comment', async () => {
    const { api, url, init } = setup({ id: 'c9' });
    await expect(
      api.addTaskComment('p1', 't1', {
        body: 'Hi @Ben Tan',
        bodyFormat: 'MARKDOWN',
        mentionedAccountIds: ['a2'],
      })
    ).resolves.toEqual({ id: 'c9' });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/comments`);
    expect(init().method).toBe('POST');
    expect(JSON.parse(init().body)).toEqual({
      body: 'Hi @Ben Tan',
      bodyFormat: 'MARKDOWN',
      mentionedAccountIds: ['a2'],
    });
  });

  it('edits a comment', async () => {
    const { api, url, init } = setup({ id: 'c 1' });
    await api.updateTaskComment('p1', 't1', 'c 1', {
      body: 'Fixed',
      bodyFormat: 'MARKDOWN',
    });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/comments/c%201`);
    expect(init().method).toBe('PUT');
    expect(JSON.parse(init().body)).toEqual({
      body: 'Fixed',
      bodyFormat: 'MARKDOWN',
    });
  });

  it('deletes a comment, taking the empty 204', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const api = new HttpFluxApi(BASE_URL, withToken, fetchFn);
    await expect(
      api.deleteTaskComment('p1', 't1', 'c1')
    ).resolves.toBeUndefined();
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${BASE_URL}/projects/p1/tasks/t1/comments/c1`
    );
    expect(fetchFn.mock.calls[0][1].method).toBe('DELETE');
  });

  it('toggles a reaction, returning the comment’s reactions', async () => {
    const reactions = [{ emoji: 'heart', count: 1, reactedByMe: true }];
    const { api, url, init } = setup(reactions);
    await expect(
      api.toggleCommentReaction('p1', 't1', 'c1', 'heart')
    ).resolves.toEqual(reactions);
    expect(url()).toBe(
      `${BASE_URL}/projects/p1/tasks/t1/comments/c1/reactions`
    );
    expect(init().method).toBe('POST');
    expect(JSON.parse(init().body)).toEqual({ emoji: 'heart' });
  });

  it('gets the caller’s subscription to a task', async () => {
    const { api, url, init } = setup({ subscribed: true });
    await expect(api.getTaskSubscription('p1', 't1')).resolves.toEqual({
      subscribed: true,
    });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/subscription`);
    expect(init().method).toBe('GET');
  });

  it('subscribes with a POST and no body', async () => {
    const { api, url, init } = setup({ subscribed: true });
    await expect(api.subscribeToTask('p1', 't1')).resolves.toEqual({
      subscribed: true,
    });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/subscribe`);
    expect(init().method).toBe('POST');
    expect(init().body).toBeUndefined();
    expect(init().headers.Authorization).toBe('Bearer a1');
  });

  it('unsubscribes with a DELETE', async () => {
    const { api, url, init } = setup({ subscribed: false });
    await expect(api.unsubscribeFromTask('p1', 't1')).resolves.toEqual({
      subscribed: false,
    });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/subscribe`);
    expect(init().method).toBe('DELETE');
  });

  it('changes a task’s status with a PATCH', async () => {
    const { api, url, init } = setup({ id: 't1', status: 'done' });
    await expect(
      api.changeTaskStatus('p1', 't1', { status: 'done', resolution: 'fixed' })
    ).resolves.toEqual({ id: 't1', status: 'done' });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/status`);
    expect(init().method).toBe('PATCH');
    expect(JSON.parse(init().body)).toEqual({
      status: 'done',
      resolution: 'fixed',
    });
  });

  it('archives a task with a POST and no body', async () => {
    const { api, url, init } = setup({ id: 't1' });
    await api.archiveTask('p1', 't1');
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/archive`);
    expect(init().method).toBe('POST');
    expect(init().body).toBeUndefined();
  });

  it('unarchives a task with a reason', async () => {
    const { api, url, init } = setup({ id: 't1' });
    await api.unarchiveTask('p1', 't1', { reason: 'Undone' });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/unarchive`);
    expect(init().method).toBe('POST');
    expect(JSON.parse(init().body)).toEqual({ reason: 'Undone' });
  });

  it('updates a task with a PUT of the whole body', async () => {
    const { api, url, init } = setup({ id: 't1' });
    await api.updateTask('p1', 't1', { title: 'New', labels: ['a'] });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1`);
    expect(init().method).toBe('PUT');
    expect(JSON.parse(init().body)).toEqual({ title: 'New', labels: ['a'] });
  });

  it('moves a task to the root with a null parent', async () => {
    const { api, url, init } = setup({ id: 't1' });
    await api.changeTaskParent('p1', 't1', { parentTaskId: null });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/parent`);
    expect(init().method).toBe('PATCH');
    expect(JSON.parse(init().body)).toEqual({ parentTaskId: null });
  });

  it('assigns a task with a PATCH of every assignee', async () => {
    const { api, url, init } = setup({ id: 't1' });
    await api.assignTask('p1', 't1', { assigneeIds: ['a1', 'a2'] });
    expect(url()).toBe(`${BASE_URL}/projects/p1/tasks/t1/assign`);
    expect(init().method).toBe('PATCH');
    expect(JSON.parse(init().body)).toEqual({ assigneeIds: ['a1', 'a2'] });
  });

  it('deletes a task, taking the empty 204', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const api = new HttpFluxApi(BASE_URL, withToken, fetchFn);
    await expect(api.deleteTask('p1', 't1')).resolves.toBeUndefined();
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/projects/p1/tasks/t1`);
    expect(fetchFn.mock.calls[0][1].method).toBe('DELETE');
  });

  it('lists a project’s labels', async () => {
    const { api, url } = setup([{ id: 'l1', name: 'safari' }]);
    await expect(api.listLabels('p1')).resolves.toEqual([
      { id: 'l1', name: 'safari' },
    ]);
    expect(url()).toBe(`${BASE_URL}/projects/p1/labels`);
  });

  it('adds and removes a task’s label by the label’s id', async () => {
    const fetchFn = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 204 }))
      );
    const api = new HttpFluxApi(BASE_URL, withToken, fetchFn);
    await api.addTaskLabel('p1', 'l1', 't1');
    await api.removeTaskLabel('p1', 'l1', 't1');
    const path = `${BASE_URL}/projects/p1/labels/l1/tasks/t1`;
    expect(fetchFn.mock.calls.map(([u, i]) => [u, i.method])).toEqual([
      [path, 'POST'],
      [path, 'DELETE'],
    ]);
  });

  it('lists a project’s resolutions', async () => {
    const { api, url } = setup([{ slug: 'fixed' }]);
    await expect(api.listResolutions('p1')).resolves.toEqual([
      { slug: 'fixed' },
    ]);
    expect(url()).toBe(`${BASE_URL}/projects/p1/resolutions`);
  });

  it('lists notifications', async () => {
    const { api, url } = setup({ content: [] });
    await api.listNotifications({ isRead: false });
    expect(url()).toBe(`${BASE_URL}/notifications?isRead=false`);
  });

  it('makes every call through withAccessToken', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const withAccessToken = vi.fn(withToken) as unknown as WithAccessToken;
    const api = new HttpFluxApi(BASE_URL, withAccessToken, fetchFn);

    await api.listMyTasks();
    await api.getTask('p1', 't1');
    expect(withAccessToken).toHaveBeenCalledTimes(2);
  });

  it('surfaces a failure as an ApiError', async () => {
    const { api } = setup({ code: 'NOT_FOUND', message: 'No such task' }, 404);
    const error = await api.getTask('p1', 'nope').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
  });
});
