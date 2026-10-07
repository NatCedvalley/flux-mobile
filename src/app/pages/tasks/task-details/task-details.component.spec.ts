import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Task } from '@core/api';
import { TaskDetailsComponent } from './task-details.component';

const TODAY = '2026-10-01';

const TASK: Task = {
  id: 't1',
  projectId: 'p1',
  taskKey: 'CHK-142',
  title: 'Fix 3DS redirect',
  type: 'BUG',
  statusCategory: 'IN_PROGRESS',
  dueDate: '2026-09-12',
  assignees: [
    { accountId: 'a1', firstName: 'Ada', lastName: 'Rahman' },
    { accountId: 'a2', firstName: 'Ben', lastName: 'Tan' },
  ],
  reporterId: 'a2',
  reporterFirstName: 'Ben',
  reporterLastName: 'Tan',
  linkedReleases: [{ id: 'r1', versionTag: 'v2.4.0', title: 'Payments' }],
  parentTask: { id: 'e1', taskKey: 'CHK-120', title: 'Migrate saved cards' },
  labels: ['safari', 'payments', '3ds', 'web'],
  description: 'Repro on **expired** sessions.',
  descriptionFormat: 'MARKDOWN',
};

describe('TaskDetailsComponent', () => {
  let fixture: ComponentFixture<TaskDetailsComponent>;

  function create(task: Task, subtasks?: Task[]) {
    TestBed.configureTestingModule({
      imports: [TaskDetailsComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(TaskDetailsComponent);
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('today', TODAY);
    fixture.componentRef.setInput('subtasks', subtasks);
    fixture.componentRef.setInput('detailBase', '/tabs/projects/search/tasks');
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (selector: string) =>
    element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const texts = (selector: string) =>
    Array.from(element().querySelectorAll(selector)).map((e) =>
      e.textContent?.replace(/\s+/g, ' ').trim()
    );

  it('shows the first assignee plus how many more, and the reporter', () => {
    create(TASK);
    expect(texts('.person .name')).toEqual(['Ada Rahman', 'Ben Tan']);
    expect(text('.person .more')).toBe('+1');
    expect(texts('.person .avatar')).toEqual(['AR', 'BT']);
  });

  it('says when nobody is assigned', () => {
    create({ ...TASK, assignees: [] });
    expect(text('.person .name')).toBe('Unassigned');
  });

  it('shows an overdue due date in red, release, parent and labels', () => {
    create(TASK);
    const due = element().querySelector('.due')!;
    expect(due.textContent?.trim()).toBe('12 Sep · overdue');
    expect(due.classList).toContain('overdue');
    expect(text('.chip.release')).toBe('v2.4.0 Payments');
    expect(text('.parent .key')).toBe('CHK-120');
    expect(text('.parent-title')).toBe('Migrate saved cards');
    expect(texts('.field:last-child .chip')).toEqual([
      'safari',
      'payments',
      '+2',
    ]);
  });

  it('links the parent within this stack', () => {
    create(TASK);
    expect(element().querySelector('a.parent')?.getAttribute('href')).toBe(
      '/tabs/projects/search/tasks/p1/e1'
    );
  });

  it('says None for empty fields and No description', () => {
    create({
      id: 't1',
      projectId: 'p1',
      title: 'Bare',
      type: 'TASK',
    });
    expect(text('.due')).toBe('No due date');
    expect(texts('.value.none')).toEqual([
      'No due date',
      'None',
      'None',
      'None',
    ]);
    expect(text('.description .none')).toBe('No description');
  });

  it('renders the description as rich text, clamped', () => {
    create(TASK);
    const body = element().querySelector('.description .rich-text-content')!;
    expect(body.querySelector('strong')?.textContent).toBe('expired');
    expect(body.classList).toContain('clamped');
  });

  it('shows subtasks for a container only', () => {
    create(TASK);
    expect(element().querySelector('.subtasks')).toBeNull();
  });

  it('lists an epic’s subtasks, linking each', () => {
    create({ ...TASK, type: 'EPIC' }, [
      {
        id: 'c1',
        projectId: 'p1',
        taskKey: 'CHK-1',
        title: 'One',
        type: 'TASK',
      },
    ]);
    expect(text('.subtasks .count')).toBe('1');
    expect(text('.subtask .key')).toBe('CHK-1');
    expect(text('.subtask-title')).toBe('One');
    expect(element().querySelector('a.subtask')?.getAttribute('href')).toBe(
      '/tabs/projects/search/tasks/p1/c1'
    );
  });

  it('says when an epic has no subtasks, or they are loading', () => {
    create({ ...TASK, type: 'MASTER' }, []);
    expect(text('.subtasks > .none')).toBe('No subtasks yet');
    fixture.componentRef.setInput('subtasks', undefined);
    fixture.detectChanges();
    expect(text('.subtasks > .none')).toBe('Loading subtasks…');
  });

  describe('editing', () => {
    function edit(task: Task, editable = true) {
      create(task);
      fixture.componentRef.setInput('editable', editable);
      fixture.detectChanges();
    }

    it('shows nothing to edit unless editable', () => {
      edit(TASK, false);
      expect(element().querySelector('button.field')).toBeNull();
      expect(element().querySelector('.edit-description')).toBeNull();
      expect(element().querySelector('.web-note')).toBeNull();
    });

    it('asks for the due date, labels and description editors', () => {
      edit(TASK);
      const asked: string[] = [];
      const component = fixture.componentInstance;
      component.editDue.subscribe(() => asked.push('due'));
      component.editLabels.subscribe(() => asked.push('labels'));
      component.editDescription.subscribe(() => asked.push('description'));

      for (const selector of [
        '.edit-due',
        '.edit-labels',
        '.edit-description',
      ]) {
        element().querySelector<HTMLButtonElement>(selector)!.click();
      }

      expect(asked).toEqual(['due', 'labels', 'description']);
      expect(text('.edit-due .value')).toBe('12 Sep · overdue');
    });

    it('keeps the parent row a link', () => {
      edit(TASK);
      expect(element().querySelector('a.parent')).not.toBeNull();
    });

    it('sends a description written on the web to the web', () => {
      edit({ ...TASK, description: '<p>Hi</p>', descriptionFormat: 'HTML' });
      expect(element().querySelector('.edit-description')).toBeNull();
      expect(text('.web-note')).toBe('Formatted on the web — edit it there.');
    });
  });
});
