import type { TaskComment } from '../api';
import { canEditComment, withComment, withoutComment } from './thread';

const THREAD: TaskComment[] = [
  { id: 'c1', body: 'one', replies: [{ id: 'c2', body: 'reply' }] },
  { id: 'c3', body: 'three' },
];

describe('withComment', () => {
  it('changes a top-level comment', () => {
    const thread = withComment(THREAD, 'c3', (c) => ({ ...c, body: 'new' }));
    expect(thread[1].body).toBe('new');
    expect(thread[0]).toBe(THREAD[0]);
  });

  it('changes a reply', () => {
    const thread = withComment(THREAD, 'c2', (c) => ({ ...c, body: 'new' }));
    expect(thread[0].replies?.[0].body).toBe('new');
    expect(THREAD[0].replies?.[0].body).toBe('reply');
  });
});

describe('withoutComment', () => {
  it('drops a top-level comment or a reply', () => {
    expect(withoutComment(THREAD, 'c3').map((c) => c.id)).toEqual(['c1']);
    expect(withoutComment(THREAD, 'c2')[0].replies).toEqual([]);
  });
});

describe('canEditComment', () => {
  it('edits Markdown', () => {
    expect(canEditComment({ body: '**hi**', bodyFormat: 'MARKDOWN' })).toBe(
      true
    );
    expect(canEditComment({ body: 'hi' })).toBe(true);
  });

  it('leaves HTML and Editor.js to the web', () => {
    expect(canEditComment({ body: '<p>hi</p>', bodyFormat: 'HTML' })).toBe(
      false
    );
    expect(canEditComment({ body: '{}', bodyFormat: 'EDITORJS' })).toBe(false);
    expect(
      canEditComment({
        body: '{"blocks":[{"type":"paragraph","data":{"text":"hi"}}]}',
        bodyFormat: 'MARKDOWN',
      })
    ).toBe(false);
  });
});
