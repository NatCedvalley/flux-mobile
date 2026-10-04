import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilterButtonComponent } from './filter-button.component';

describe('FilterButtonComponent', () => {
  let fixture: ComponentFixture<FilterButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilterButtonComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(FilterButtonComponent);
  });

  function button(): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector('button')!;
  }

  it('hides the badge when no filter is in use', () => {
    fixture.detectChanges();

    expect(button().querySelector('ion-badge')).toBeNull();
    expect(button().getAttribute('aria-label')).toBe('Filters');
  });

  it('counts the filters in use on the badge and in its label', () => {
    fixture.componentRef.setInput('count', 2);
    fixture.detectChanges();

    expect(button().querySelector('ion-badge')?.textContent).toBe('2');
    expect(button().getAttribute('aria-label')).toBe('Filters, 2 active');
  });
});
