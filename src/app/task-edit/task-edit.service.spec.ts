import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import type { Task } from '@core/api';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { FLUX_API } from '../providers/flux-api.token';
import { TaskChangesService } from '../task-status/task-changes.service';
import { TaskEditService } from './task-edit.service';

describe('TaskEditService', () => {
  let api: InMemoryFluxApi;
  let toast: { create: ReturnType<typeof vi.fn> };
  let service: TaskEditService;
  let shown: Task[];
  const view = { apply: (t: Task) => shown.push(t) };

  beforeEach(() => {
    api = new InMemoryFluxApi();
    toast = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    TestBed.configureTestingModule({
      providers: [
        { provide: FLUX_API, useValue: api },
        { provide: ToastController, useValue: toast },
      ],
    });
    service = TestBed.inject(TaskEditService);
    shown = [];
  });

  it('shows a change, then the server’s copy, and reports it', async () => {
    const task = await api.getTask('p1', '1');
    await expect(service.update(task, { title: 'New' }, view)).resolves.toBe(
      true
    );

    expect(shown.map((t) => t.title)).toEqual(['New', 'New']);
    expect(shown[1].assignees).toHaveLength(1);
    expect(TestBed.inject(TaskChangesService).changed()?.task.title).toBe(
      'New'
    );
  });

  it('shows the server’s copy when only some label changes land', async () => {
    const task = await api.getTask('p1', '1');
    const labels = await api.listLabels('p1');
    const android = labels.find((l) => l.name === 'android')!;
    const ios = labels.find((l) => l.name === 'ios')!;
    const add = api.addTaskLabel.bind(api);
    vi.spyOn(api, 'addTaskLabel').mockImplementation((p, labelId, t) =>
      labelId === ios.id
        ? Promise.reject(new ApiError(403, { message: 'No' }))
        : add(p, labelId, t)
    );

    await expect(
      service.setLabels(task, [android, ios], [], view)
    ).resolves.toBe(false);

    expect(shown.at(-1)?.labels).toEqual([
      'safari',
      'payments',
      '3ds',
      'android',
    ]);
    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'No' })
    );
  });

  it('changes labels one at a time, so the server’s label names stay right', async () => {
    const task = await api.getTask('p1', '1');
    const labels = await api.listLabels('p1');
    const ios = labels.find((l) => l.name === 'ios')!;
    const safari = labels.find((l) => l.name === 'safari')!;
    let finishAdd: () => void = () => undefined;
    vi.spyOn(api, 'addTaskLabel').mockReturnValue(
      new Promise<void>((resolve) => (finishAdd = resolve))
    );
    const remove = vi.spyOn(api, 'removeTaskLabel');

    const done = service.setLabels(task, [ios], [safari], view);
    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();

    finishAdd();
    await done;
    expect(remove).toHaveBeenCalledWith('p1', safari.id, '1');
  });

  it('says why a delete failed, and reports nothing', async () => {
    const task = await api.getTask('p1', '1');
    vi.spyOn(api, 'deleteTask').mockRejectedValue(new ApiError(0, {}));

    await expect(service.delete(task)).resolves.toBe(false);

    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Couldn’t delete the task' })
    );
    expect(TestBed.inject(TaskChangesService).changed()).toBeUndefined();
  });
});
