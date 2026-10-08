import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextEditSheetComponent } from './text-edit-sheet.component';

describe('TextEditSheetComponent', () => {
  let fixture: ComponentFixture<TextEditSheetComponent>;
  let saved: string[];

  function create(inputs: Record<string, unknown> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [TextEditSheetComponent] });
    fixture = TestBed.createComponent(TextEditSheetComponent);
    fixture.componentRef.setInput('heading', 'Title');
    fixture.componentRef.setInput('value', 'Fix 3DS redirect');
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    saved = [];
    fixture.componentInstance.saved.subscribe((v) => saved.push(v));
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;
  const textarea = () =>
    element().querySelector<HTMLIonTextareaElement>('ion-textarea')!;
  const save = () => element().querySelector<HTMLIonButtonElement>('.save')!;
  const type = (value: string) => {
    textarea().dispatchEvent(
      new CustomEvent('ionInput', { detail: { value } })
    );
    fixture.detectChanges();
  };
  const enter = () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      cancelable: true,
    });
    textarea().dispatchEvent(event);
    return event;
  };

  it('saves the text once it has changed, trimmed', () => {
    create();
    expect(save().disabled).toBe(true);

    type('  Fix the 3DS redirect ');
    expect(save().disabled).toBe(false);
    save().click();

    expect(saved).toEqual(['Fix the 3DS redirect']);
  });

  it('won’t save a required text left blank', () => {
    create({ required: true });
    type('   ');
    expect(save().disabled).toBe(true);
  });

  it('shows a counter up to the limit', () => {
    create({ maxLength: 120 });
    expect(textarea().maxlength).toBe(120);
    expect(textarea().counter).toBe(true);
  });

  it('saves on Enter in a single line', () => {
    create({ singleLine: true });
    type('Renamed');
    expect(enter().defaultPrevented).toBe(true);
    expect(saved).toEqual(['Renamed']);
  });

  it('starts a new line on Enter otherwise', () => {
    create();
    type('Line one');
    expect(enter().defaultPrevented).toBe(false);
    expect(saved).toEqual([]);
  });
});
