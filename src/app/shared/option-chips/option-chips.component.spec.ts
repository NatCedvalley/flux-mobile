import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OptionChipsComponent } from './option-chips.component';

describe('OptionChipsComponent', () => {
  let fixture: ComponentFixture<OptionChipsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OptionChipsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(OptionChipsComponent);
    fixture.componentRef.setInput('options', [
      { value: 'todo', label: 'To Do', dot: 'var(--flux-blue9)' },
      { value: 'done', label: 'Done' },
    ]);
    fixture.componentRef.setInput('selected', ['done']);
    fixture.detectChanges();
  });

  function chips(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('ion-chip')
    );
  }

  it('marks the selected chips, and shows a status dot', () => {
    expect(chips().map((c) => c.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
    ]);
    expect(chips()[1].classList).toContain('selected');
    expect(chips()[0].querySelector('.dot')).not.toBeNull();
    expect(chips()[1].querySelector('.dot')).toBeNull();
  });

  it('toggles a value on tap', () => {
    const changes: (readonly string[])[] = [];
    fixture.componentInstance.selected.subscribe((v) => changes.push(v));

    chips()[0].click();
    chips()[1].click();

    expect(changes).toEqual([['done', 'todo'], ['todo']]);
  });
});
