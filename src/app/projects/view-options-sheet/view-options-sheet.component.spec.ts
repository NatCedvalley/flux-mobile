import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViewOptionsSheetComponent } from './view-options-sheet.component';

describe('ViewOptionsSheetComponent', () => {
  let fixture: ComponentFixture<ViewOptionsSheetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewOptionsSheetComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ViewOptionsSheetComponent);
    fixture.componentRef.setInput('groupBy', 'status');
    fixture.componentRef.setInput('sort', 'createdAt,desc');
    fixture.detectChanges();
  });

  function rows(section: string): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        `.${section} ion-item`
      )
    );
  }

  it('lists the group-bys and sorts, the current ones checked', () => {
    const labels = (section: string) =>
      rows(section).map((r) => r.textContent?.trim());
    const current = (section: string) =>
      rows(section)
        .filter((r) => r.getAttribute('aria-checked') === 'true')
        .map((r) => r.textContent?.trim());

    expect(labels('group-by')).toEqual([
      'Not grouped',
      'Status',
      'Priority',
      'Type',
    ]);
    expect(labels('sort')).toEqual([
      'Newest first',
      'Recently updated',
      'Due date',
      'Priority',
      'Key',
      'Title A–Z',
    ]);
    expect(current('group-by')).toEqual(['Status']);
    expect(current('sort')).toEqual(['Newest first']);
  });

  it('reports a tapped group-by or sort', () => {
    const picked: string[] = [];
    fixture.componentInstance.groupByChange.subscribe((g) => picked.push(g));
    fixture.componentInstance.sortChange.subscribe((s) => picked.push(s));

    rows('group-by')[2].click();
    rows('sort')[2].click();

    expect(picked).toEqual(['priority', 'dueDate,asc']);
  });
});
