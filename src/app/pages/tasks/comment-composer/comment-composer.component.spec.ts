import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  type CommentDraft,
  CommentComposerComponent,
} from './comment-composer.component';

describe('CommentComposerComponent', () => {
  let fixture: ComponentFixture<CommentComposerComponent>;
  let sent: CommentDraft[];
  let mentions: number;
  /** The native field, whose caret the composer reads. */
  let native: HTMLTextAreaElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(CommentComposerComponent);
    sent = [];
    mentions = 0;
    fixture.componentInstance.send.subscribe((d) => sent.push(d));
    fixture.componentInstance.mention.subscribe(() => mentions++);
    fixture.detectChanges();
    native = document.createElement('textarea');
    // Ionic's textarea isn't hydrated in tests: stand in for it.
    const field = textarea();
    field.getInputElement = () => Promise.resolve(native);
    field.setFocus = vi.fn().mockResolvedValue(undefined);
  });

  const element = () => fixture.nativeElement as HTMLElement;
  const textarea = () =>
    element().querySelector<HTMLIonTextareaElement>('ion-textarea')!;
  const send = () => element().querySelector<HTMLIonButtonElement>('.send')!;
  const type = async (value: string) => {
    native.value = value;
    native.setSelectionRange(value.length, value.length);
    textarea().dispatchEvent(
      new CustomEvent('ionInput', { detail: { value } })
    );
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('sends trimmed text once there is some', async () => {
    expect(send().disabled).toBe(true);
    await type('   ');
    expect(send().disabled).toBe(true);

    await type('  Looks good ');
    expect(send().disabled).toBe(false);
    expect(send().classList).toContain('ready');
    send().click();

    expect(sent).toEqual([{ body: 'Looks good', mentionedAccountIds: [] }]);
  });

  it('waits while a comment is sending', async () => {
    await type('Hi');
    fixture.componentRef.setInput('sending', true);
    fixture.detectChanges();
    expect(send().disabled).toBe(true);
  });

  it('asks for the picker on an @ that starts a word, or the @ button', async () => {
    await type('mail ada@');
    expect(mentions).toBe(0);
    await type('thanks @');
    expect(mentions).toBe(1);

    element().querySelector<HTMLElement>('.at')!.click();
    await fixture.whenStable();
    expect(mentions).toBe(2);
  });

  it('puts the mention in and sends its id while it stays', async () => {
    await type('thanks @');
    await fixture.componentInstance.insertMention({
      id: 'a2',
      name: 'Ben Tan',
    });
    fixture.detectChanges();
    expect(native.value).toBe('thanks @Ben Tan ');
    expect(native.selectionStart).toBe(16);

    send().click();
    expect(sent.at(-1)).toEqual({
      body: 'thanks @Ben Tan',
      mentionedAccountIds: ['a2'],
    });

    await type('thanks @Ben');
    send().click();
    expect(sent.at(-1)?.mentionedAccountIds).toEqual([]);
  });

  it('focuses the native field, which Ionic hands over once rendered', async () => {
    document.body.appendChild(native);
    await fixture.componentInstance.focus();
    expect(document.activeElement).toBe(native);
    native.remove();
  });

  it('empties the field once cleared', async () => {
    await type('Posted');
    fixture.componentInstance.clear();
    fixture.detectChanges();
    expect(send().disabled).toBe(true);
  });

  it('shows the paperclip only to those who may attach', () => {
    const paperclip = () =>
      element().querySelector<HTMLIonButtonElement>('.attach');
    expect(paperclip()).toBeNull();

    let attached = 0;
    fixture.componentInstance.attach.subscribe(() => attached++);
    fixture.componentRef.setInput('canAttach', true);
    fixture.detectChanges();
    paperclip()!.click();
    expect(attached).toBe(1);

    fixture.componentRef.setInput('attaching', true);
    fixture.detectChanges();
    expect(paperclip()!.disabled).toBe(true);
  });
});
