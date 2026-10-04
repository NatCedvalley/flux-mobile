import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY_FILTERS, type TaskFilters } from '@core/task-filters';
import { TaskFilterSheetComponent } from './task-filter-sheet.component';

describe('TaskFilterSheetComponent', () => {
  let fixture: ComponentFixture<TaskFilterSheetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskFilterSheetComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(TaskFilterSheetComponent);
    fixture.componentRef.setInput('statusOptions', [
      { value: 'todo', label: 'To Do' },
      { value: 'done', label: 'Done' },
    ]);
    fixture.componentRef.setInput('filters', {
      ...EMPTY_FILTERS,
      priorities: ['HIGH'],
    });
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function filters(): TaskFilters {
    return fixture.componentInstance.filters();
  }

  it('shows the statuses and priorities as chips, the chosen ones checked', () => {
    fixture.detectChanges();

    const checked = Array.from(
      element().querySelectorAll('ion-chip[aria-checked="true"]')
    ).map((c) => c.textContent?.trim());
    expect(element().querySelectorAll('.status ion-chip')).toHaveLength(2);
    expect(element().querySelectorAll('.priority ion-chip')).toHaveLength(4);
    expect(checked).toEqual(['High']);
  });

  it('edits the draft from the chips', () => {
    fixture.detectChanges();

    element().querySelector<HTMLElement>('.status ion-chip')!.click();
    element().querySelector<HTMLElement>('.priority ion-chip')!.click();

    expect(filters()).toEqual({
      statuses: ['todo'],
      priorities: ['HIGH', 'CRITICAL'],
      assigneeIds: [],
    });
  });

  it('toggles an assignee, with the caller listed as Me', () => {
    fixture.componentRef.setInput('assignees', [
      { accountId: 'a1', label: 'Me', person: { firstName: 'Ada' } },
      { accountId: 'a2', label: 'Ben Tan', person: { firstName: 'Ben' } },
    ]);
    fixture.detectChanges();
    const rows = () =>
      Array.from(element().querySelectorAll<HTMLElement>('.assignee ion-item'));

    expect(rows().map((r) => r.querySelector('.name')?.textContent)).toEqual([
      'Me',
      'Ben Tan',
    ]);
    rows()[1].click();
    fixture.detectChanges();
    expect(filters().assigneeIds).toEqual(['a2']);
    expect(rows()[1].getAttribute('aria-checked')).toBe('true');

    rows()[1].click();
    expect(filters().assigneeIds).toEqual([]);
  });

  it('shows a placeholder while the assignees load, and Retry when they fail', () => {
    fixture.detectChanges();
    expect(
      element().querySelector('.assignee ion-skeleton-text')
    ).not.toBeNull();

    const retries: unknown[] = [];
    fixture.componentInstance.retryAssignees.subscribe(() => retries.push(1));
    fixture.componentRef.setInput('assigneesFailed', true);
    fixture.detectChanges();
    element().querySelector<HTMLElement>('.assignee ion-button')!.click();
    expect(retries).toHaveLength(1);
  });

  it('resets every filter', () => {
    fixture.detectChanges();

    element().querySelector<HTMLElement>('.reset')!.click();

    expect(filters()).toEqual(EMPTY_FILTERS);
  });
});
