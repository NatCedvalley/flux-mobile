import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  type OverflowAction,
  TaskOverflowSheetComponent,
} from './task-overflow-sheet.component';

describe('TaskOverflowSheetComponent', () => {
  let fixture: ComponentFixture<TaskOverflowSheetComponent>;

  function create(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [TaskOverflowSheetComponent] });
    fixture = TestBed.createComponent(TaskOverflowSheetComponent);
    fixture.componentRef.setInput('taskKey', 'CHK-142');
    fixture.componentRef.setInput('title', 'Fix 3DS redirect on Safari');
    fixture.componentRef.setInput('watching', true);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;
  // Ionic's label patches textContent in tests, so its markup is read.
  const rows = () =>
    Array.from(element().querySelectorAll('ion-item ion-label')).map((l) =>
      l.innerHTML.replace(/<[^>]*>/g, '').trim()
    );
  const text = (selector: string) =>
    element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

  it('gives a VIEWER Copy link and the watch toggle only', () => {
    create();
    expect(text('h1')).toBe('CHK-142');
    expect(text('.subtitle')).toBe('Fix 3DS redirect on Safari');
    expect(rows()).toEqual(['Copy link', 'Stop watching']);
    expect(element().querySelector('.band')).toBeNull();
  });

  it('gives a LEAD every row, with Delete apart', () => {
    create({
      canReassign: true,
      canEdit: true,
      canArchive: true,
      canDelete: true,
      assignee: 'Ada Rahman +1',
      commentCount: 4,
      watching: false,
    });
    expect(rows()).toEqual([
      'Reassign',
      'Change parent',
      'Copy link',
      'Watch',
      'Archive',
      'Delete task',
    ]);
    expect(text('.reassign .aside')).toBe('Ada Rahman +1');
    expect(text('.delete .aside')).toBe('and 4 comments');
    expect(element().querySelector('.band')).not.toBeNull();
  });

  it('says which row was chosen', () => {
    create({ canDelete: true });
    const chosen: OverflowAction[] = [];
    fixture.componentInstance.action.subscribe((a) => chosen.push(a));
    element().querySelector<HTMLElement>('.link')!.click();
    element().querySelector<HTMLElement>('.delete')!.click();
    expect(chosen).toEqual(['link', 'delete']);
  });

  it('waits for the subscription before offering the watch toggle', () => {
    create({ watching: undefined });
    expect(
      element().querySelector<HTMLIonItemElement>('.watch')?.disabled
    ).toBe(true);
  });
});
