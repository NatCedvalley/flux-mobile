import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Names an `ion-searchbar`'s input. Ionic labels the input "search text"
 * whatever the host's `aria-label` says (that names only the search
 * landmark), so screen readers never heard what the field searches.
 */
@Directive({ selector: 'ion-searchbar[appSearchLabel]' })
export class SearchLabelDirective {
  readonly appSearchLabel = input.required<string>();

  private readonly host =
    inject<ElementRef<HTMLIonSearchbarElement>>(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      const label = this.appSearchLabel();
      void this.host.getInputElement?.().then((input) => {
        input?.setAttribute('aria-label', label);
      });
    });
  }
}
