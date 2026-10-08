import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  type CommentSheetChoice,
  CommentSheetComponent,
} from './comment-sheet.component';

describe('CommentSheetComponent', () => {
  let fixture: ComponentFixture<CommentSheetComponent>;
  let chosen: CommentSheetChoice[];

  function create(inputs: Record<string, unknown>) {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(CommentSheetComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    chosen = [];
    fixture.componentInstance.choice.subscribe((c) => chosen.push(c));
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;

  it('offers the eight reactions, marking the caller’s', () => {
    create({
      mode: 'react',
      reactions: [{ emoji: 'eyes', count: 1, reactedByMe: true }],
    });
    const choices = Array.from(
      element().querySelectorAll<HTMLButtonElement>('.reaction-choice')
    );
    expect(choices.map((c) => c.textContent?.trim())).toEqual([
      '👍',
      '👎',
      '❤️',
      '🎉',
      '😄',
      '😕',
      '👀',
      '🚀',
    ]);
    expect(element().querySelector('.mine')?.textContent?.trim()).toBe('👀');

    choices[2].click();
    expect(chosen).toEqual([{ kind: 'react', emoji: 'heart' }]);
    expect(element().querySelector('.edit')).toBeNull();
  });

  it('offers Edit, then Delete', () => {
    create({ mode: 'actions' });
    element().querySelector<HTMLElement>('.edit')!.click();
    element().querySelector<HTMLElement>('.delete')!.click();
    expect(chosen).toEqual([{ kind: 'edit' }, { kind: 'delete' }]);
    expect(element().querySelector('.web-only')).toBeNull();
  });

  it('leaves a comment formatted on the web to the web', () => {
    create({ mode: 'actions', editable: false });
    expect(element().querySelector<HTMLIonItemElement>('.edit')?.disabled).toBe(
      true
    );
    expect(element().querySelector('.web-only')?.textContent).toContain(
      'edit it there'
    );
  });
});
