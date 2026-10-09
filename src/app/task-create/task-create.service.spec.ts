import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { type TaskDraft, emptyDraft } from '@core/task-create';
import { FLUX_API } from '../providers/flux-api.token';
import { TaskCreateService } from './task-create.service';

describe('TaskCreateService', () => {
  let api: InMemoryFluxApi;
  let toast: { create: ReturnType<typeof vi.fn> };
  let service: TaskCreateService;
  const draft = (fields: Partial<TaskDraft> = {}): TaskDraft => ({
    ...emptyDraft('p1'),
    title: 'New one',
    ...fields,
  });

  beforeEach(() => {
    api = new InMemoryFluxApi();
    toast = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    TestBed.configureTestingModule({
      providers: [
        { provide: FLUX_API, useValue: api },
        { provide: ToastController, useValue: toast },
      ],
    });
    service = TestBed.inject(TaskCreateService);
  });

  it('creates the task', async () => {
    const created = await service.create(draft({ type: 'BUG' }), []);

    expect(created?.task).toMatchObject({ taskKey: 'CHK-161', type: 'BUG' });
    expect(created?.labelsFailed).toBe(false);
    expect(toast.create).not.toHaveBeenCalled();
  });

  it('attaches the labels after the create, one at a time, by id', async () => {
    const labels = await api.listLabels('p1');
    const addTaskLabel = vi.spyOn(api, 'addTaskLabel');

    const created = await service.create(
      draft({ labelNames: ['ios', 'safari'] }),
      labels
    );

    expect(addTaskLabel.mock.calls.map(([, labelId]) => labelId)).toEqual([
      'l4',
      'l1',
    ]);
    expect(created?.task.labels).toEqual(['ios', 'safari']);
    expect(created?.labelsFailed).toBe(false);
  });

  it('keeps the task when a label fails, and says so', async () => {
    const labels = await api.listLabels('p1');
    vi.spyOn(api, 'addTaskLabel').mockRejectedValueOnce(new ApiError(500));

    const created = await service.create(
      draft({ labelNames: ['ios', 'safari'] }),
      labels
    );

    expect(created?.labelsFailed).toBe(true);
    expect(created?.task.labels).toEqual(['safari']);
    await service.announce(created!, false, vi.fn());
    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'CHK-161 created, but some labels couldn’t be added.',
        positionAnchor: 'tab-bar',
      })
    );
  });

  it('shows the server’s message when the create fails', async () => {
    vi.spyOn(api, 'createTask').mockRejectedValue(
      new ApiError(422, { message: 'Task quota exceeded' })
    );

    await expect(service.create(draft(), [])).resolves.toBeUndefined();

    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Task quota exceeded' })
    );
  });

  it('says the task was created, with Open', async () => {
    const open = vi.fn();
    const created = await service.create(draft(), []);

    await service.announce(created!, true, open);

    const options = toast.create.mock.calls[0][0];
    expect(options).toMatchObject({
      message: 'CHK-161 created',
      positionAnchor: undefined,
    });
    options.buttons[0].handler();
    expect(open).toHaveBeenCalled();
  });
});
