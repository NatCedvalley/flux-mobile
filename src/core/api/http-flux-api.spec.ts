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

  it('lists a project’s workflow statuses', async () => {
    const { api, url } = setup([{ slug: 'todo' }]);
    await expect(api.listWorkflowStatuses('p1')).resolves.toEqual([
      { slug: 'todo' },
    ]);
    expect(url()).toBe(`${BASE_URL}/projects/p1/workflow-statuses`);
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
