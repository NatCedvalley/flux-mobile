import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import type { TaskComment } from '@core/api';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { ConnectivityService } from '../offline/connectivity.service';
import { WriteQueueService } from '../offline/write-queue.service';
import { FLUX_API } from '../providers/flux-api.token';
import { CommentService } from './comment.service';

describe('CommentService', () => {
  let api: InMemoryFluxApi;
  let toast: { create: ReturnType<typeof vi.fn> };
  let online: ReturnType<typeof signal<boolean>>;
  let writeQueue: WriteQueueService;
  let service: CommentService;
  const target = {
    projectId: 'p1',
    taskId: '1',
    taskKey: 'CHK-142',
    anchor: 'bar',
  };
  const lastToast = () => toast.create.mock.calls.at(-1)?.[0];

  beforeEach(async () => {
    api = new InMemoryFluxApi();
    toast = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    online = signal(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: FLUX_API, useValue: api },
        { provide: ToastController, useValue: toast },
        { provide: ConnectivityService, useValue: { online } },
      ],
    });
    writeQueue = TestBed.inject(WriteQueueService);
    await writeQueue.queue.load('a1');
    service = TestBed.inject(CommentService);
  });

  it('posts Markdown with the mentions', async () => {
    const add = vi.spyOn(api, 'addTaskComment');
    const posted = await service.post(target, 'Hi @Ben Tan', ['a2']);

    expect((posted as TaskComment).body).toBe('Hi @Ben Tan');
    expect(add).toHaveBeenCalledWith('p1', '1', {
      body: 'Hi @Ben Tan',
      bodyFormat: 'MARKDOWN',
      mentionedAccountIds: ['a2'],
    });
  });

  it('leaves the mentions out when there are none', async () => {
    const add = vi.spyOn(api, 'addTaskComment');
    await service.post(target, 'Hi', []);
    expect(add.mock.calls[0][2].mentionedAccountIds).toBeUndefined();
  });

  describe('offline', () => {
    it('queues a comment without trying the server', async () => {
      online.set(false);
      const add = vi.spyOn(api, 'addTaskComment');

      expect(await service.post(target, 'Hi @Ben Tan', ['a2'])).toBe('queued');

      expect(add).not.toHaveBeenCalled();
      expect(writeQueue.items()).toEqual([
        expect.objectContaining({
          kind: 'comment',
          projectId: 'p1',
          taskId: '1',
          taskKey: 'CHK-142',
          body: 'Hi @Ben Tan',
          mentionedAccountIds: ['a2'],
          state: 'queued',
        }),
      ]);
      expect(writeQueue.items()[0]).not.toHaveProperty('attempted');
    });

    it('queues a comment whose POST got no response, as attempted', async () => {
      vi.spyOn(api, 'addTaskComment').mockRejectedValue(new ApiError(0));

      expect(await service.post(target, 'Hi', [])).toBe('queued');

      expect(writeQueue.items()[0]).toMatchObject({ attempted: true });
      expect(toast.create).not.toHaveBeenCalled();
    });

    it('queues behind a comment of the task’s still queued', async () => {
      online.set(false);
      await service.post(target, 'First', []);
      online.set(true);
      const add = vi.spyOn(api, 'addTaskComment');

      expect(await service.post(target, 'Second', [])).toBe('queued');

      expect(add).not.toHaveBeenCalled();
      expect(writeQueue.items()).toHaveLength(2);
    });

    it('keeps the text when there is no account to queue for', async () => {
      online.set(false);
      await writeQueue.queue.load(undefined);

      expect(await service.post(target, 'Hi', [])).toBeUndefined();
      expect(lastToast()).toMatchObject({
        message: 'Couldn’t post the comment',
        positionAnchor: 'bar',
      });
    });

    it('says edits, deletes and reactions need a connection', async () => {
      online.set(false);
      const update = vi.spyOn(api, 'updateTaskComment');
      const remove = vi.spyOn(api, 'deleteTaskComment');
      const toggle = vi.spyOn(api, 'toggleCommentReaction');

      expect(
        await service.update(target, { id: 'c2' }, 'Edited')
      ).toBeUndefined();
      expect(lastToast()).toMatchObject({
        message: 'Editing needs a connection.',
        positionAnchor: 'bar',
      });
      expect(await service.remove(target, { id: 'c2' })).toBe(false);
      expect(lastToast().message).toBe('Deleting comments needs a connection.');
      expect(await service.react(target, { id: 'c2' }, 'eyes')).toBeUndefined();
      expect(lastToast().message).toBe('Reacting needs a connection.');

      expect(update).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(toggle).not.toHaveBeenCalled();
    });
  });

  it('shows the server’s message above the anchor when refused', async () => {
    await expect(
      service.update(target, { id: 'c1' }, 'Not mine')
    ).resolves.toBeUndefined();
    expect(lastToast()).toMatchObject({
      message: 'Only the comment author can edit or delete this comment.',
      positionAnchor: 'bar',
    });
  });

  it('says so once a comment is deleted', async () => {
    await expect(service.remove(target, { id: 'c2' })).resolves.toBe(true);
    expect(lastToast().message).toBe('Comment deleted');
  });

  it('swaps the caller’s reaction for the one picked', async () => {
    const toggle = vi.spyOn(api, 'toggleCommentReaction');
    const comment = (await api.listTaskComments('p1', '1')).content![0];

    const reactions = await service.react(target, comment, 'eyes');

    expect(toggle.mock.calls.map((c) => c[3])).toEqual(['thumbs_up', 'eyes']);
    expect(reactions).toEqual([
      { emoji: 'thumbs_up', count: 1, reactedByMe: false },
      { emoji: 'eyes', count: 2, reactedByMe: true },
    ]);
  });

  it('keeps what landed when a reaction swap fails half way', async () => {
    const toggle = api.toggleCommentReaction.bind(api);
    vi.spyOn(api, 'toggleCommentReaction').mockImplementation(
      (p, t, c, emoji) =>
        emoji === 'eyes'
          ? Promise.reject(new Error('offline'))
          : toggle(p, t, c, emoji)
    );
    const comment = (await api.listTaskComments('p1', '1')).content![0];

    const reactions = await service.react(target, comment, 'eyes');

    expect(reactions).toEqual([
      { emoji: 'thumbs_up', count: 1, reactedByMe: false },
      { emoji: 'eyes', count: 1, reactedByMe: false },
    ]);
    expect(lastToast().message).toBe('Couldn’t change the reaction');
  });
});
