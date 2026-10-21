import type { FluxApi } from '../api';
import { ApiError } from '../auth/api-error';
import { InMemoryFluxApi } from '../mock/in-memory-flux-api';
import { MemoryCacheStore } from './cache-store';
import { CachingFluxApi } from './caching-flux-api';
import { ResponseCache } from './response-cache';

describe('CachingFluxApi', () => {
  let inner: InMemoryFluxApi;
  let cache: ResponseCache;
  let online: boolean;
  let accountId: string | undefined;
  let api: FluxApi;

  beforeEach(() => {
    inner = new InMemoryFluxApi();
    cache = new ResponseCache(new MemoryCacheStore());
    online = true;
    accountId = 'a1';
    api = new CachingFluxApi(inner, cache, {
      accountId: () => accountId,
      online: () => online,
    });
  });

  /** A task id the in-memory backend knows. */
  async function firstTask(): Promise<{ projectId: string; id: string }> {
    const page = await inner.listMyTasks();
    const task = page.content?.[0];
    return { projectId: task?.projectId ?? '', id: task?.id ?? '' };
  }

  it('serves the saved copy when the backend can’t be reached', async () => {
    const task = await firstTask();
    const fetched = await api.getTask(task.projectId, task.id);
    vi.spyOn(inner, 'getTask').mockRejectedValue(new ApiError(0));

    expect(await api.getTask(task.projectId, task.id)).toEqual(fetched);
  });

  it('rethrows no response when nothing is saved', async () => {
    const error = new ApiError(0);
    vi.spyOn(inner, 'getTask').mockRejectedValue(error);

    await expect(api.getTask('p1', 'nope')).rejects.toBe(error);
  });

  it.each([404, 500])(
    'rethrows a %i rather than the saved copy',
    async (status) => {
      const task = await firstTask();
      await api.getTask(task.projectId, task.id);
      const error = new ApiError(status);
      vi.spyOn(inner, 'getTask').mockRejectedValue(error);

      await expect(api.getTask(task.projectId, task.id)).rejects.toBe(error);
    }
  );

  it('keeps the latest copy', async () => {
    await api.notificationUnreadCount();
    vi.spyOn(inner, 'notificationUnreadCount').mockResolvedValueOnce({
      unreadCount: 7,
    });
    await api.notificationUnreadCount();
    online = false;

    expect(await api.notificationUnreadCount()).toEqual({ unreadCount: 7 });
  });

  describe('offline', () => {
    it('serves the saved copy without calling the backend', async () => {
      const fetched = await api.listMyProjects({ tz: 'Asia/Kuala_Lumpur' });
      online = false;
      const call = vi.spyOn(inner, 'listMyProjects');

      expect(await api.listMyProjects({ tz: 'Asia/Kuala_Lumpur' })).toEqual(
        fetched
      );
      expect(call).not.toHaveBeenCalled();
    });

    it('fails at once for a read with nothing saved', async () => {
      online = false;
      const call = vi.spyOn(inner, 'listMyProjects');

      await expect(api.listMyProjects()).rejects.toMatchObject({ status: 0 });
      expect(call).not.toHaveBeenCalled();
    });

    it('fails at once for a read that is never cached', async () => {
      await api.listNotifications({ page: 1, size: 30 });
      online = false;
      const call = vi.spyOn(inner, 'listNotifications');

      await expect(
        api.listNotifications({ page: 1, size: 30 })
      ).rejects.toMatchObject({ status: 0 });
      await expect(api.listLabels('p1')).rejects.toMatchObject({ status: 0 });
      expect(call).not.toHaveBeenCalled();
    });

    it('still sends writes', async () => {
      online = false;
      const write = vi
        .spyOn(inner, 'markAllNotificationsRead')
        .mockResolvedValue({});

      await api.markAllNotificationsRead();

      expect(write).toHaveBeenCalled();
    });
  });

  it('keeps nothing without an account', async () => {
    accountId = undefined;
    await api.listMyProjects();
    accountId = 'a1';
    online = false;

    await expect(api.listMyProjects()).rejects.toMatchObject({ status: 0 });
  });

  it('keeps each account’s copies apart', async () => {
    await api.listMyProjects();
    accountId = 'a2';
    online = false;

    await expect(api.listMyProjects()).rejects.toMatchObject({ status: 0 });
  });

  it('passes every argument through', async () => {
    const list = vi
      .spyOn(inner, 'listTaskComments')
      .mockResolvedValue({ content: [] });

    await api.listTaskComments('p1', 't1', { page: 2, size: 100 });

    expect(list).toHaveBeenCalledWith('p1', 't1', { page: 2, size: 100 });
  });
});
