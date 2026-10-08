import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { TaskComment } from '@core/api';
import {
  type CommentReact,
  TaskCommentsComponent,
} from './task-comments.component';

const NOW = new Date(2026, 9, 1, 12, 0);
const hoursAgo = (hours: number) =>
  new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const COMMENTS: TaskComment[] = [
  {
    id: 'c1',
    authorId: 'a2',
    authorFirstName: 'Ben',
    authorLastName: 'Tan',
    body: 'Seen on **iOS** too',
    bodyFormat: 'MARKDOWN',
    createdAt: hoursAgo(48),
    reactions: [
      { emoji: 'thumbs_up', count: 2, reactedByMe: true },
      { emoji: 'eyes', count: 1, reactedByMe: false },
    ],
    replies: [
      {
        id: 'c2',
        authorId: 'a1',
        authorFirstName: 'Ada',
        authorLastName: 'Rahman',
        body: '<p>Thanks</p>',
        bodyFormat: 'HTML',
        createdAt: hoursAgo(3),
        edited: true,
      },
    ],
  },
];

describe('TaskCommentsComponent', () => {
  let fixture: ComponentFixture<TaskCommentsComponent>;

  function create(inputs: Record<string, unknown> = {}) {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(TaskCommentsComponent);
    fixture.componentRef.setInput('comments', COMMENTS);
    fixture.componentRef.setInput('myId', 'a1');
    fixture.componentRef.setInput('now', NOW);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  beforeEach(() => create());

  const element = () => fixture.nativeElement as HTMLElement;
  const texts = (selector: string) =>
    Array.from(element().querySelectorAll(selector)).map((e) =>
      e.textContent?.replace(/\s+/g, ' ').trim()
    );

  it('shows each comment with its author and age, replies nested', () => {
    expect(texts('.thread > li > .comment .author')).toEqual(['Ben Tan']);
    expect(texts('.replies .author')).toEqual(['Ada Rahman']);
    expect(texts('.age')).toEqual(['2d', 'You · 3h · edited']);
  });

  it('renders each body in its format', () => {
    expect(element().querySelector('.thread strong')?.textContent).toBe('iOS');
    expect(element().querySelector('.replies p')?.textContent).toBe('Thanks');
  });

  it('tints the caller’s own comments', () => {
    expect(
      Array.from(element().querySelectorAll('.bubble')).map((b) =>
        b.classList.contains('mine')
      )
    ).toEqual([false, true]);
  });

  it('shows reactions by their glyph, marking the caller’s', () => {
    expect(texts('.reaction')).toEqual(['👍2', '👀1']);
    expect(
      element().querySelector('.reaction.mine')?.getAttribute('aria-label')
    ).toBe('thumbs up 2, including you');
  });

  it('only shows reactions until the role is known', () => {
    expect(
      element().querySelector<HTMLButtonElement>('.reaction')?.disabled
    ).toBe(true);
    expect(element().querySelector('.add-reaction')).toBeNull();
    expect(element().querySelector('.more')).toBeNull();
  });

  it('toggles a reaction and asks for the reaction sheet', () => {
    create({ canReact: true });
    const reacted: CommentReact[] = [];
    const added: TaskComment[] = [];
    fixture.componentInstance.react.subscribe((r) => reacted.push(r));
    fixture.componentInstance.addReaction.subscribe((c) => added.push(c));

    element().querySelectorAll<HTMLElement>('.reaction')[1].click();
    element().querySelector<HTMLElement>('.add-reaction')!.click();

    expect(reacted).toEqual([{ comment: COMMENTS[0], emoji: 'eyes' }]);
    expect(added).toEqual([COMMENTS[0]]);
    // The reply has no reactions yet, but can still get one.
    expect(element().querySelectorAll('.add-reaction')).toHaveLength(2);
  });

  it('offers Edit and Delete on the caller’s own comments only', () => {
    create({ canWrite: true });
    const asked: TaskComment[] = [];
    fixture.componentInstance.actions.subscribe((c) => asked.push(c));

    const more = element().querySelectorAll<HTMLElement>('.more');
    expect(more).toHaveLength(1);
    more[0].click();
    expect(asked.map((c) => c.id)).toEqual(['c2']);
  });
});
