import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { TaskComment } from '@core/api';
import { TaskCommentsComponent } from './task-comments.component';

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
      { emoji: '👍', count: 2, reactedByMe: true },
      { emoji: '👀', count: 1, reactedByMe: false },
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

  beforeEach(() => {
    fixture = TestBed.createComponent(TaskCommentsComponent);
    fixture.componentRef.setInput('comments', COMMENTS);
    fixture.componentRef.setInput('myId', 'a1');
    fixture.componentRef.setInput('now', NOW);
    fixture.detectChanges();
  });

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

  it('shows reactions, marking the caller’s', () => {
    expect(texts('.reaction')).toEqual(['👍2', '👀1']);
    expect(
      element().querySelector('.reaction.mine')?.getAttribute('aria-label')
    ).toBe('👍 2, including you');
  });
});
