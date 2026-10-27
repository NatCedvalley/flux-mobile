import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FluxSheetDirective } from './flux-sheet.directive';
import { sheetEnterAnimation, sheetLeaveAnimation } from './sheet-animation';

@Component({
  template: `
    <ion-modal class="flux-sheet flux-sheet-auto"></ion-modal>
    <ion-modal class="flux-create-sheet"></ion-modal>
  `,
  imports: [FluxSheetDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class HostComponent {}

describe('FluxSheetDirective', () => {
  it("gives flux-sheet modals the handoff's timing and leaves others alone", () => {
    const fixture = TestBed.createComponent(HostComponent);
    const [sheet, other] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('ion-modal')
    );

    expect(sheet.enterAnimation).toBe(sheetEnterAnimation);
    expect(sheet.leaveAnimation).toBe(sheetLeaveAnimation);
    expect(other.enterAnimation).toBeUndefined();
    expect(other.leaveAnimation).toBeUndefined();
  });
});
