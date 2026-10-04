import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Task } from '@core/api';
import { ProjectTaskRowComponent } from './project-task-row.component';

const TODAY = '2026-10-01';

/** An ion-icon's `name`, which Angular sets as a property, not an attribute. */
function iconName(icon: Element | null | undefined): string | undefined {
  return (icon as { name?: string } | null | undefined)?.name;
}

describe('ProjectTaskRowComponent', () => {
  let fixture: ComponentFixture<ProjectTaskRowComponent>;

  function render(task: Task): HTMLElement {
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('today', TODAY);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function text(el: HTMLElement, selector: string): string | undefined {
    return el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  }

  /** The meta line's parts, in order. */
  function meta(el: HTMLElement): string[] {
    return Array.from(el.querySelector('.meta')?.children ?? []).map(
      (part) => part.textContent?.trim() ?? ''
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectTaskRowComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ProjectTaskRowComponent);
  });

  it('shows the type icon, title, key, priority, due date and assignee', () => {
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
    expect(text(el, '.title')).toBe('Ship it');
    expect(meta(el)).toEqual(['CHK-7', 'High', 'Thu 8 Oct']);
    expect(iconName(el.querySelector('.priority ion-icon'))).toBe('arrow-up');
    expect(text(el, '.avatar')).toBe('AR');
    expect(el.querySelector('.avatar')?.getAttribute('aria-label')).toBe(
      'Assigned to Ada Rahman'
    );
    expect(el.querySelector('ion-item')?.getAttribute('href')).toBe(
      '/tasks/p1/t1'
    );
  });

  it('marks an overdue open task in words and red', () => {
    const el = render({ id: 't1', priority: 'LOW', dueDate: '2026-09-30' });

    const due = el.querySelector('.due');
    expect(due?.classList).toContain('overdue');
    expect(due?.textContent?.trim()).toBe('Due yesterday');
    expect(iconName(el.querySelector('.priority ion-icon'))).toBe('arrow-down');
  });

  it('shows an unassigned glyph and no due date when there is none', () => {
    const el = render({ id: 't1', title: 'Bare' });

    expect(iconName(el.querySelector('.type'))).toBe('square-check');
    expect(meta(el)).toEqual(['No due date']);
    expect(el.querySelector('.avatar')?.classList).toContain('unassigned');
    expect(iconName(el.querySelector('.avatar ion-icon'))).toBe('user');
  });
});
