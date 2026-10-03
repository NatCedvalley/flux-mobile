import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MyTask } from '@core/api';
import { TaskRowComponent } from './task-row.component';

const TODAY = '2026-10-01';

/** An ion-icon's `name`, which Angular sets as a property, not an attribute. */
function iconName(icon: Element | null | undefined): string | undefined {
  return (icon as { name?: string } | null | undefined)?.name;
}

describe('TaskRowComponent', () => {
  let fixture: ComponentFixture<TaskRowComponent>;

  function render(task: MyTask): HTMLElement {
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('today', TODAY);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskRowComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(TaskRowComponent);
  });

  it('shows the type icon, title, meta line and project chip', () => {
    const el = render({
      id: 't1',
      projectId: 'p1',
      projectName: 'Checkout',
      taskKey: 'CHK-7',
      title: 'Ship it',
      type: 'FEATURE',
      statusName: 'To Do',
      statusCategory: 'TODO',
      priority: 'MEDIUM',
      dueDate: '2026-10-08',
    });

    expect(iconName(el.querySelector('.type'))).toBe('sparkles');
    expect(el.querySelector('.title')?.textContent).toBe('Ship it');
    expect(
      el
        .querySelector<HTMLElement>('.status')
        ?.style.getPropertyValue('--status-text')
    ).toBe('var(--flux-blue11)');
    expect(el.querySelector('.status')?.textContent?.trim()).toBe('To Do');
    expect(el.querySelector('.due')?.textContent?.trim()).toBe('Thu 8 Oct');
    expect(el.querySelector('.key')?.textContent).toBe('CHK-7');
    expect(el.querySelector('.project')?.textContent?.trim()).toBe('Checkout');
    expect(el.querySelector('ion-item')?.getAttribute('href')).toBe(
      '/tasks/p1/t1'
    );
  });

  it('shows a high priority instead of the due date', () => {
    const el = render({ id: 't1', priority: 'HIGH', dueDate: TODAY });

    expect(el.querySelector('.priority')?.textContent?.trim()).toBe('High');
    expect(iconName(el.querySelector('.priority ion-icon'))).toBe('arrow-up');
    expect(el.querySelector('.due')).toBeNull();
  });

  it('marks an overdue task in red and in words', () => {
    const el = render({ id: 't1', priority: 'LOW', dueDate: '2026-09-30' });

    expect(el.querySelector('.type')?.classList).toContain('overdue');
    const due = el.querySelector('.due');
    expect(due?.classList).toContain('overdue');
    expect(due?.textContent?.trim()).toBe('Due yesterday');
  });

  it('leaves out the parts a task does not have', () => {
    const el = render({ id: 't1', title: 'Bare' });

    expect(iconName(el.querySelector('.type'))).toBe('square-check');
    expect(el.querySelector('.meta')?.children).toHaveLength(0);
    expect(el.querySelector('.project')).toBeNull();
  });
});
