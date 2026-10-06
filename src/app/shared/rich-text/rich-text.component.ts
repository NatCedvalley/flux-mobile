import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { type RichTextFormat, renderRichText } from '@core/rich-text';

/**
 * A description or comment body as the web shows it: Markdown, Editor.js
 * JSON or HTML, rendered and sanitized by `renderRichText`. With `clamp`, it
 * shows that many lines and a Show more / Show less toggle when the body is
 * longer.
 */
@Component({
  selector: 'app-rich-text',
  templateUrl: './rich-text.component.html',
  // The rendered HTML gets no encapsulation attributes, so its styles are a
  // global stylesheet (`rich-text.scss`, listed in angular.json), scoped by
  // the `app-rich-text` selector instead.
  encapsulation: ViewEncapsulation.None,
})
export class RichTextComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly body = input<string>();
  readonly format = input<RichTextFormat>();
  /** Lines to show before Show more; unset shows everything. */
  readonly clamp = input<number>();

  private readonly content =
    viewChild.required<ElementRef<HTMLElement>>('content');

  // Already sanitized by DOMPurify. Angular's own sanitizer would also strip
  // what the policy keeps on purpose, such as a mention's account id.
  protected readonly html = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      renderRichText(this.body(), this.format())
    )
  );
  protected readonly expanded = signal(false);
  /** The clamped body is taller than its clamp, so Show more is offered. */
  protected readonly overflowing = signal(false);

  constructor() {
    afterRenderEffect(() => {
      this.html();
      this.clamp();
      if (!this.expanded()) {
        this.measure();
      }
    });
    // A new width (rotation) can change whether the body fits.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (!this.expanded()) {
          this.measure();
        }
      });
      afterRenderEffect(() => observer.observe(this.content().nativeElement));
      inject(DestroyRef).onDestroy(() => observer.disconnect());
    }
  }

  protected toggle(): void {
    this.expanded.update((expanded) => !expanded);
  }

  private measure(): void {
    const el = this.content().nativeElement;
    this.overflowing.set(
      !!this.clamp() && el.scrollHeight > el.clientHeight + 1
    );
  }
}
