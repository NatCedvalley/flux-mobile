import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { MyProject } from '@core/api';
import { EMPTY_MY_TASK_FILTERS, type MyTaskFilters } from '@core/task-filters';
import { MyTaskFilterSheetComponent } from './my-task-filter-sheet.component';

const PROJECTS: MyProject[] = [
  { project: { id: 'p1', name: 'Checkout' } },
  { project: { id: 'p2', name: 'Billing' } },
];

describe('MyTaskFilterSheetComponent', () => {
  let fixture: ComponentFixture<MyTaskFilterSheetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyTaskFilterSheetComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(MyTaskFilterSheetComponent);
    fixture.componentRef.setInput('projects', PROJECTS);
    fixture.detectChanges();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function filters(): MyTaskFilters {
    return fixture.componentInstance.filters();
  }

  function projectRows(): HTMLElement[] {
    return Array.from(element().querySelectorAll('.project ion-item'));
  }

  it('lists Any project and each project, Any project checked', () => {
    expect(projectRows().map((r) => r.textContent?.trim())).toEqual([
      'Any project',
      'Checkout',
      'Billing',
    ]);
    expect(projectRows()[0].getAttribute('aria-checked')).toBe('true');
  });

  it('asks for a project before offering statuses', () => {
    expect(element().querySelector('.status .note')?.textContent).toBe(
      'Pick a project to filter by status.'
    );
    expect(element().querySelector('.status ion-chip')).toBeNull();
  });

  it("offers the picked project's statuses, and drops them when the project changes", () => {
    projectRows()[1].click();
    fixture.componentRef.setInput('statusOptions', [
      { value: 'todo', label: 'To Do' },
    ]);
    fixture.detectChanges();
    expect(filters().projectId).toBe('p1');

    element().querySelector<HTMLElement>('.status ion-chip')!.click();
    expect(filters().statuses).toEqual(['todo']);

    projectRows()[2].click();
    expect(filters()).toEqual({
      projectId: 'p2',
      statuses: [],
      priorities: [],
    });
  });

  it('filters by priority and resets', () => {
    element().querySelector<HTMLElement>('.priority ion-chip')!.click();
    expect(filters().priorities).toEqual(['CRITICAL']);

    element().querySelector<HTMLElement>('.reset')!.click();
    expect(filters()).toEqual(EMPTY_MY_TASK_FILTERS);
  });
});
