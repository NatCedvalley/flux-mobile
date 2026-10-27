import { Directive, ElementRef, inject } from '@angular/core';
import { sheetEnterAnimation, sheetLeaveAnimation } from './sheet-animation';

/**
 * Gives every `flux-sheet` modal the handoff's sheet timing (280 ms in,
 * 220 ms out) in place of Ionic's 500 ms. A component that declares a
 * `flux-sheet` modal imports it; the class is the selector, so the
 * templates don't change.
 */
// The class every sheet already has, rather than another attribute to add.
// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: 'ion-modal.flux-sheet' })
export class FluxSheetDirective {
  constructor() {
    const modal =
      inject<ElementRef<HTMLIonModalElement>>(ElementRef).nativeElement;
    modal.enterAnimation = sheetEnterAnimation;
    modal.leaveAnimation = sheetLeaveAnimation;
  }
}
