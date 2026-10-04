import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FluxApi } from '@core/api';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { AuthService } from '../auth/auth.service';
import { FLUX_API } from '../providers/flux-api.token';
import { MyProjectsService } from './my-projects.service';

describe('MyProjectsService', () => {
  let api: InMemoryFluxApi;
  let account: ReturnType<typeof signal<{ id: string } | undefined>>;
  let service: MyProjectsService;

  beforeEach(() => {
    api = new InMemoryFluxApi();
    account = signal<{ id: string } | undefined>({ id: 'me' });
    TestBed.configureTestingModule({
      providers: [
        { provide: FLUX_API, useValue: api as FluxApi },
        { provide: AuthService, useValue: { account } },
      ],
    });
    service = TestBed.inject(MyProjectsService);
  });

  it('fetches the projects once, with the time zone', async () => {
    const spy = vi.spyOn(api, 'listMyProjects');

    const [first, second] = await Promise.all([service.load(), service.load()]);
    await service.load();

    expect(first).toBe(second);
    expect(first.map((p) => p.project?.id)).toEqual(['p1', 'p2']);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      size: 100,
    });
  });

  it('fetches again after invalidate', async () => {
    const spy = vi.spyOn(api, 'listMyProjects');
    await service.load();
    service.invalidate();
    await service.load();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('fetches again for another account', async () => {
    const spy = vi.spyOn(api, 'listMyProjects');
    await service.load();
    account.set({ id: 'someone-else' });
    await service.load();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('forgets a failed fetch, so the next call retries', async () => {
    const spy = vi
      .spyOn(api, 'listMyProjects')
      .mockRejectedValueOnce(new Error('offline'));

    await expect(service.load()).rejects.toThrow('offline');
    await expect(service.load()).resolves.toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('answers the role and what it allows', async () => {
    expect(await service.role('p1')).toBe('EDITOR');
    expect(await service.role('nope')).toBeUndefined();
    expect(await service.can('p1', 'edit')).toBe(true);
    expect(await service.can('p1', 'delete')).toBe(false);
    expect(await service.can('p2', 'delete')).toBe(true);
    expect(await service.can('nope', 'read')).toBe(false);
  });
});
