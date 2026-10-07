import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DateSheetComponent } from './date-sheet.component';

describe('DateSheetComponent', () => {
  let fixture: ComponentFixture<DateSheetComponent>;
  let saved: (string | undefined)[];
  let done: number;

  function create(value?: string) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [DateSheetComponent] });
    fixture = TestBed.createComponent(DateSheetComponent);
    fixture.componentRef.setInput('heading', 'Due date');
    fixture.componentRef.setInput('value', value);
    saved = [];
    done = 0;
    fixture.componentInstance.saved.subscribe((v) => saved.push(v));
    fixture.componentInstance.done.subscribe(() => done++);
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;
  const click = (selector: string) =>
    element().querySelector<HTMLElement>(selector)!.click();
  const pick = (value: string) => {
    element()
      .querySelector('ion-datetime')!
      .dispatchEvent(new CustomEvent('ionChange', { detail: { value } }));
    fixture.detectChanges();
  };

  it('saves the day picked, date-only', () => {
    create('2026-10-12');
    pick('2026-10-20T00:00:00');
    click('.done');
    expect(saved).toEqual(['2026-10-20']);
  });

  it('just closes when nothing changed', () => {
    create('2026-10-12');
    click('.done');
    expect(saved).toEqual([]);
    expect(done).toBe(1);
  });

  it('clears the date', () => {
    create('2026-10-12');
    click('.clear');
    expect(saved).toEqual([undefined]);
  });

  it('just closes when there was no date to clear', () => {
    create();
    click('.clear');
    expect(saved).toEqual([]);
    expect(done).toBe(1);
  });
});
