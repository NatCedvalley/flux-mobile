import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Task } from '@core/api';
import { BoardCardComponent } from './board-card.component';

const TODAY = '2026-10-01';

/** An ion-icon's `name`, which Angular sets as a property, not an attribute. */
function iconName(icon: Element | null | undefined): string | undefined {
  return (icon as { name?: string } | null | undefined)?.name;
}

describe('BoardCardComponent', () => {
  let fixture: ComponentFixture<BoardCardComponent>;

  function render(task: Task): HTMLElement {
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('today', TODAY);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function text(el: HTMLElement, selector: string): string | undefined {
    return el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  }

  function chips(el: HTMLElement): string[] {
    return Array.from(el.querySelectorAll('.chip')).map((c) =>
      c.classList.contains('release')
        ? `release:${c.textContent?.trim()}`
        : (c.textContent?.trim() ?? '')
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoardCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(BoardCardComponent);
  });

  it('shows the 3c anatomy: type, key, priority, title, due and assignee', () => {
    const el = render({
      id: 't1',
      projectId: 'p1',
      taskKey: 'CHK-7',
      title: 'Ship it',
      type: 'BUG',
      priority: 'HIGH',
      dueDate: '2026-10-08',
      assignees: [{ accountId: 'a1', firstName: 'Ada', lastName: 'Rahman' }],
    });

    expect(iconName(el.querySelector('.type'))).toBe('bug');
    expect(text(el, '.key')).toBe('CHK-7');
    expect(text(el, '.priority')).toBe('High');
    expect(el.querySelector('.priority')?.getAttribute('data-level')).toBe(
      'HIGH'
    );
    expect(text(el, '.title')).toBe('Ship it');
    expect(text(el, '.due')).toBe('Thu 8 Oct');
    expect(el.querySelector('.due')?.classList).not.toContain('urgent');
    expect(text(el, '.avatar')).toBe('AR');
    expect(el.querySelector('.avatar')?.getAttribute('aria-label')).toBe(
      'Assigned to Ada Rahman'
    );
  });

  it('shows the first release, then labels, two chips at most', () => {
    const el = render({
      id: 't1',
      linkedReleases: [
        { id: 'r1', versionTag: 'v2.4.0' },
        { id: 'r2', versionTag: 'v2.5.0' },
      ],
      labels: ['perf', 'api', 'ui'],
    });

    expect(chips(el)).toEqual(['release:v2.4.0', 'perf']);
    expect(chips(render({ id: 't2', labels: ['perf', 'api', 'ui'] }))).toEqual([
      'perf',
      'api',
    ]);
  });

  it('marks a due date of today or earlier red, with a clock', () => {
    let el = render({ id: 't1', dueDate: TODAY, statusCategory: 'TODO' });
    expect(el.querySelector('.due')?.classList).toContain('urgent');
    expect(iconName(el.querySelector('.due ion-icon'))).toBe('clock');

    el = render({ id: 't1', dueDate: '2026-09-28', statusCategory: 'TODO' });
    expect(el.querySelector('.due')?.classList).toContain('urgent');
  });

  it('never marks a done task, and shows nothing without a due date', () => {
    let el = render({
      id: 't1',
      dueDate: '2026-09-28',
      statusCategory: 'DONE',
    });
    expect(el.querySelector('.due')?.classList).not.toContain('urgent');

    el = render({ id: 't1' });
    expect(el.querySelector('.due')).toBeNull();
  });

  it('shows a user glyph when nobody is assigned', () => {
    const el = render({ id: 't1' });

    expect(
      el.querySelector('.avatar.unassigned')?.getAttribute('aria-label')
    ).toBe('Unassigned');
  });

  it('links to task detail with the task as navigation state', () => {
    const el = render({ id: 't1', projectId: 'p1' });

    expect(el.querySelector('a')?.getAttribute('href')).toBe('/tasks/p1/t1');
  });
});
