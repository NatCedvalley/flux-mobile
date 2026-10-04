import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { TaskActivity, WorkflowStatus } from '@core/api';
import { TaskActivityComponent } from './task-activity.component';

const NOW = new Date(2026, 9, 1, 12, 0);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

const STATUSES: WorkflowStatus[] = [
  { slug: 'todo', name: 'To Do', category: 'TODO', color: 'blue' },
  {
    slug: 'in_progress',
    name: 'In Progress',
    category: 'IN_PROGRESS',
    color: 'amber',
  },
];

const ENTRIES: TaskActivity[] = [
  {
    id: 'e3',
    action: 'STATUS_CHANGED',
    actorName: 'Ada Rahman',
    oldValue: 'todo',
    newValue: 'in_progress',
    createdAt: at(1, 8, 2),
  },
  {
    id: 'e2',
    action: 'FIELD_UPDATED',
    field: 'priority',
    actorName: 'Ada Rahman',
    oldValue: 'HIGH',
    newValue: 'CRITICAL',
    createdAt: at(1, 7, 30),
  },
  {
    id: 'e1',
    action: 'ASSIGNED',
    actorName: 'Ben Tan',
    newValueDisplay: 'Ada Rahman',
    createdAt: new Date(2026, 8, 11, 9).toISOString(),
  },
];

describe('TaskActivityComponent', () => {
  let fixture: ComponentFixture<TaskActivityComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TaskActivityComponent);
    fixture.componentRef.setInput('entries', ENTRIES);
    fixture.componentRef.setInput('statuses', STATUSES);
    fixture.componentRef.setInput('now', NOW);
    fixture.detectChanges();
  });

  const element = () => fixture.nativeElement as HTMLElement;
  const texts = (selector: string) =>
    Array.from(element().querySelectorAll(selector)).map((e) =>
      e.textContent?.replace(/\s+/g, ' ').trim()
    );

  it('groups entries under day headers', () => {
    expect(texts('.day-label')).toEqual(['Today', 'Friday 11 September']);
  });

  it('reads each entry with old → new values and the time', () => {
    expect(texts('.text p')).toEqual([
      // The arrow between the values is an icon (read as "to").
      'Ada Rahman changed status To DoIn Progress',
      'Ada Rahman changed priority HighCritical',
      'Ben Tan assigned to Ada Rahman',
    ]);
    expect(texts('.time')).toEqual(['08:02', '07:30', '09:00']);
  });

  it('shows status values as pills by name and tints badges', () => {
    expect(texts('.pill')).toEqual(['To Do', 'In Progress']);
    expect(
      Array.from(element().querySelectorAll('.badge')).map((b) =>
        b.getAttribute('data-tone')
      )
    ).toEqual(['amber', 'red', 'gray']);
  });

  it('joins entries within a day, not after the last', () => {
    expect(element().querySelectorAll('.connector')).toHaveLength(1);
  });
});
