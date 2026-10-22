import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import type { Task } from '@core/api';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { ConnectivityService } from '../offline/connectivity.service';
import { FLUX_API } from '../providers/flux-api.token';
import { TaskChangesService } from '../task-status/task-changes.service';
import { TaskEditService } from './task-edit.service';

describe('TaskEditService', () => {
  let api: InMemoryFluxApi;
  let toast: { create: ReturnType<typeof vi.fn> };
  let service: TaskEditService;
  let shown: Task[];
  let online: ReturnType<typeof signal<boolean>>;
  const view = { apply: (t: Task) => shown.push(t) };

  beforeEach(() => {
    api = new InMemoryFluxApi();
    toast = {
      create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
    };
    online = signal(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: FLUX_API, useValue: api },
        { provide: ToastController, useValue: toast },
        { provide: ConnectivityService, useValue: { online } },
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

  describe('reschedule', () => {
    /** The Undo button's handler from the last toast. */
    const undo = () => {
      const options = toast.create.mock.lastCall?.[0] as {
        buttons: { handler: () => void }[];
      };
      options.buttons[0].handler();
    };

    it('moves the dates, keeping every other field, and offers Undo', async () => {
      const task = await api.getTask('p1', '1');
      await expect(
        service.reschedule(task, { dueDate: '2030-01-02' }, view)
      ).resolves.toBe(true);

      const saved = await api.getTask('p1', '1');
      expect(saved.dueDate).toBe('2030-01-02');
      expect(saved).toMatchObject({
        labels: task.labels,
        environment: task.environment,
        affectedVersion: task.affectedVersion,
        fixVersion: task.fixVersion,
        bugOccurredAt: task.bugOccurredAt,
        affectedUser: task.affectedUser,
      });
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Rescheduled CHK-142' })
      );
    });

    it('puts the old dates back on Undo, without offering Undo again', async () => {
      const task = await api.getTask('p1', '4');
      await service.reschedule(
        task,
        { plannedStartDate: '2030-01-02', plannedEndDate: '2030-01-04' },
        view
      );

      undo();
      await vi.waitFor(async () =>
        expect((await api.getTask('p1', '4')).plannedStartDate).toBe(
          task.plannedStartDate
        )
      );
      const restored = await api.getTask('p1', '4');
      expect(restored.plannedEndDate).toBe(task.plannedEndDate);
      expect(restored.dueDate).toBe(task.dueDate);
      expect(toast.create).toHaveBeenCalledOnce();
      expect(shown.at(-1)?.plannedStartDate).toBe(task.plannedStartDate);
    });

    it('unschedules again on Undo of a first date', async () => {
      const task = await api.getTask('p1', '8');
      await service.reschedule(task, { dueDate: '2030-01-02' }, view);

      undo();
      await vi.waitFor(async () =>
        expect((await api.getTask('p1', '8')).dueDate).toBeUndefined()
      );
    });

    it('puts the task back and offers no Undo when the server refuses', async () => {
      const task = await api.getTask('p1', '1');
      vi.spyOn(api, 'updateTask').mockRejectedValue(
        new ApiError(400, { message: 'Nope' })
      );

      await expect(
        service.reschedule(task, { dueDate: '2030-01-02' }, view)
      ).resolves.toBe(false);

      expect(shown.at(-1)).toBe(task);
      expect(toast.create).toHaveBeenCalledOnce();
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Nope' })
      );
    });
  });

  describe('offline', () => {
    beforeEach(() => online.set(false));

    it('says an edit needs a connection, and changes nothing', async () => {
      const task = await api.getTask('p1', '1');
      const update = vi.spyOn(api, 'updateTask');

      await expect(service.update(task, { title: 'New' }, view)).resolves.toBe(
        false
      );

      expect(update).not.toHaveBeenCalled();
      expect(shown).toEqual([]);
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Editing needs a connection.' })
      );
    });

    it('says the same for labels, without showing the saved copy', async () => {
      const task = await api.getTask('p1', '1');
      const [label] = await api.listLabels('p1');

      await expect(service.setLabels(task, [label], [], view)).resolves.toBe(
        false
      );

      expect(shown).toEqual([]);
      expect(toast.create).toHaveBeenCalledTimes(1);
    });

    it('says a reschedule needs a connection', async () => {
      const task = await api.getTask('p1', '1');

      await expect(
        service.reschedule(task, { dueDate: '2026-12-01' }, view)
      ).resolves.toBe(false);

      expect(shown).toEqual([]);
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Rescheduling needs a connection.' })
      );
    });
  });
});
