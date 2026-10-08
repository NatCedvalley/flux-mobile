import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { FLUX_API } from '../providers/flux-api.token';
import { CommentService } from './comment.service';

describe('CommentService', () => {
  let api: InMemoryFluxApi;
  let toast: { create: ReturnType<typeof vi.fn> };
  let service: CommentService;
  const target = { projectId: 'p1', taskId: '1', anchor: 'bar' };
  const lastToast = () => toast.create.mock.calls.at(-1)?.[0];

  beforeEach(() => {
    api = new InMemoryFluxApi();
    toast = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    TestBed.configureTestingModule({
      providers: [
        { provide: FLUX_API, useValue: api },
        { provide: ToastController, useValue: toast },
      ],
    });
    service = TestBed.inject(CommentService);
  });

  it('posts Markdown with the mentions', async () => {
    const add = vi.spyOn(api, 'addTaskComment');
    const posted = await service.post(target, 'Hi @Ben Tan', ['a2']);

    expect(posted?.body).toBe('Hi @Ben Tan');
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
