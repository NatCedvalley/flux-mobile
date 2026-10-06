import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RichTextComponent } from './rich-text.component';

describe('RichTextComponent', () => {
  let fixture: ComponentFixture<RichTextComponent>;

  function create(inputs: Record<string, unknown>) {
    fixture = TestBed.createComponent(RichTextComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  const content = () =>
    (fixture.nativeElement as HTMLElement).querySelector(
      '.rich-text-content'
    ) as HTMLElement;
  const toggle = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.rich-text-toggle'
    );

  it('renders Markdown as HTML', () => {
    create({ body: 'Some **bold** text', format: 'MARKDOWN' });
    expect(content().querySelector('strong')?.textContent).toBe('bold');
  });

  it('renders HTML sanitized, keeping mention ids', () => {
    create({
      body: '<p><span class="editorjs-mention" data-account-id="a1">@Ada</span></p><script>window.x=1</script><img src=x onerror="window.x=1">',
      format: 'HTML',
    });
    expect(content().querySelector('script')).toBeNull();
    expect(content().querySelector('img')?.hasAttribute('onerror')).toBe(false);
    expect(
      content()
        .querySelector('.editorjs-mention')
        ?.getAttribute('data-account-id')
    ).toBe('a1');
  });

  it('clamps when asked, offering Show more only when the body overflows', () => {
    create({ body: 'One line', format: 'MARKDOWN', clamp: 6 });
    expect(content().classList).toContain('clamped');
    expect(content().style.getPropertyValue('--clamp-lines')).toBe('6');
    // jsdom has no layout, so nothing overflows.
    expect(toggle()).toBeNull();
  });

  it('expands and collapses with the toggle', () => {
    create({ body: 'Long body', format: 'MARKDOWN', clamp: 6 });
    (
      fixture.componentInstance as unknown as {
        overflowing: { set(v: boolean): void };
      }
    ).overflowing.set(true);
    fixture.detectChanges();
    expect(toggle()?.textContent?.trim()).toBe('Show more');

    toggle()!.click();
    fixture.detectChanges();
    expect(content().classList).not.toContain('clamped');
    expect(toggle()?.textContent?.trim()).toBe('Show less');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
  });

  it('does not clamp without a clamp', () => {
    create({ body: 'Text', format: 'MARKDOWN' });
    expect(content().classList).not.toContain('clamped');
  });
});
