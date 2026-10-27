import type { Animation, AnimationBuilder } from '@ionic/angular';
import { createAnimation } from '@ionic/angular';

/** The handoff's sheet motion: in 280 ms, out 220 ms, on iOS's curve. */
export const SHEET_IN_MS = 280;
export const SHEET_OUT_MS = 220;
export const SHEET_EASING = 'cubic-bezier(.32,.72,0,1)';

/** Ionic's `ModalAnimationOptions`, which it doesn't export. */
type SheetAnimationOptions = {
  currentBreakpoint?: number;
  backdropBreakpoint?: number;
  expandToScroll?: boolean;
};

/*
 * Ionic's iOS sheet animation (@ionic/core 9.0.3: modal/animations/ios.enter.js,
 * ios.leave.js and sheet.js, the branch with no presenting element) at the
 * handoff's timing. Ionic doesn't export it, so it is copied rather than
 * wrapped. Keep the child ids and keyframes as they are: the modal builds its
 * drag gesture from `enterAnimation` and finds `wrapperAnimation`,
 * `backdropAnimation` and `contentAnimation` by id. Drag snaps pass their own
 * 500 ms, so only presenting and dismissing get faster.
 */

export const sheetEnterAnimation: AnimationBuilder = (
  baseEl: HTMLElement,
  opts: SheetAnimationOptions
): Animation => {
  const { backdropBreakpoint, expandToScroll } = opts;
  const currentBreakpoint = opts.currentBreakpoint ?? 1;
  const root = baseEl.shadowRoot ?? baseEl;

  const shouldShowBackdrop =
    backdropBreakpoint === undefined || backdropBreakpoint < currentBreakpoint;
  const initialBackdrop = shouldShowBackdrop
    ? `calc(var(--backdrop-opacity) * ${currentBreakpoint})`
    : '0';
  const backdropAnimation = createAnimation('backdropAnimation')
    .addElement(root.querySelector('ion-backdrop')!)
    .fromTo('opacity', 0, initialBackdrop);
  if (shouldShowBackdrop) {
    backdropAnimation
      .beforeStyles({ 'pointer-events': 'none' })
      .afterClearStyles(['pointer-events']);
  }

  const wrapperAnimation = createAnimation('wrapperAnimation')
    .addElement(root.querySelectorAll('.modal-wrapper, .modal-shadow'))
    .beforeStyles({ opacity: 1 })
    .keyframes([
      { offset: 0, opacity: 1, transform: 'translateY(100%)' },
      {
        offset: 1,
        opacity: 1,
        transform: `translateY(${100 - currentBreakpoint * 100}%)`,
      },
    ]);

  const animation = createAnimation('entering-base')
    .addElement(baseEl)
    .easing(SHEET_EASING)
    .duration(SHEET_IN_MS)
    .addAnimation([wrapperAnimation, backdropAnimation]);

  // Lets the content scroll at any breakpoint.
  if (!expandToScroll) {
    animation.addAnimation(
      createAnimation('contentAnimation')
        .addElement(baseEl.querySelector('.ion-page')!)
        .keyframes([
          {
            offset: 0,
            opacity: 1,
            maxHeight: `${(1 - currentBreakpoint) * 100}%`,
          },
          { offset: 1, opacity: 1, maxHeight: `${currentBreakpoint * 100}%` },
        ])
    );
  }
  return animation;
};

export const sheetLeaveAnimation: AnimationBuilder = (
  baseEl: HTMLElement,
  opts: SheetAnimationOptions
): Animation => {
  const backdropBreakpoint = opts.backdropBreakpoint ?? 0;
  const currentBreakpoint = opts.currentBreakpoint ?? 1;
  const root = baseEl.shadowRoot ?? baseEl;

  const backdropValue = `calc(var(--backdrop-opacity) * ${backdropValueForSheet(
    currentBreakpoint,
    backdropBreakpoint
  )})`;
  const backdropAnimation = createAnimation('backdropAnimation')
    .addElement(root.querySelector('ion-backdrop')!)
    .keyframes(
      backdropBreakpoint !== 0
        ? [
            { offset: 0, opacity: backdropValue },
            { offset: backdropBreakpoint, opacity: 0 },
            { offset: 1, opacity: 0 },
          ]
        : [
            { offset: 0, opacity: backdropValue },
            { offset: 1, opacity: 0 },
          ]
    );

  const wrapperAnimation = createAnimation('wrapperAnimation')
    .addElement(root.querySelectorAll('.modal-wrapper, .modal-shadow'))
    .beforeStyles({ opacity: 1 })
    .keyframes([
      {
        offset: 0,
        opacity: 1,
        transform: `translateY(${100 - currentBreakpoint * 100}%)`,
      },
      { offset: 1, opacity: 1, transform: 'translateY(100%)' },
    ]);

  return createAnimation('leaving-base')
    .addElement(baseEl)
    .easing(SHEET_EASING)
    .duration(SHEET_OUT_MS)
    .addAnimation([wrapperAnimation, backdropAnimation]);
};

/**
 * The backdrop's opacity at a breakpoint, when it only starts fading in
 * above `backdropBreakpoint` (Ionic's `getBackdropValueForSheet`).
 */
function backdropValueForSheet(
  breakpoint: number,
  backdropBreakpoint: number
): number {
  if (backdropBreakpoint === 1) {
    return 0;
  }
  const slope = 1 / (1 - backdropBreakpoint);
  return breakpoint * slope - backdropBreakpoint * slope;
}
