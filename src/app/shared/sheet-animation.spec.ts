import type { Animation } from '@ionic/angular';
import {
  SHEET_EASING,
  SHEET_IN_MS,
  SHEET_OUT_MS,
  sheetEnterAnimation,
  sheetLeaveAnimation,
} from './sheet-animation';

/** A stand-in for an ion-modal: its shadow parts and its light-DOM page. */
function modal(): HTMLElement {
  const host = document.createElement('div');
  host.attachShadow({ mode: 'open' }).innerHTML =
    '<ion-backdrop></ion-backdrop><div class="modal-wrapper"></div><div class="modal-shadow"></div>';
  host.innerHTML = '<div class="ion-page"></div>';
  return host;
}

function child(animation: Animation, id: string): Animation | undefined {
  return animation.childAnimations.find((a) => a.id === id);
}

describe('sheetEnterAnimation', () => {
  it('opens in 280 ms on the handoff curve', () => {
    const animation = sheetEnterAnimation(modal(), {
      currentBreakpoint: 1,
      backdropBreakpoint: 0,
      expandToScroll: true,
    });

    expect(animation.getDuration()).toBe(SHEET_IN_MS);
    expect(animation.getEasing()).toBe(SHEET_EASING);
  });

  it("keeps the child ids and elements Ionic's sheet gesture looks up", () => {
    const el = modal();
    const root = el.shadowRoot!;
    const animation = sheetEnterAnimation(el, {
      currentBreakpoint: 1,
      backdropBreakpoint: 0,
      expandToScroll: false,
    });

    expect(child(animation, 'wrapperAnimation')!.elements).toEqual([
      root.querySelector('.modal-wrapper'),
      root.querySelector('.modal-shadow'),
    ]);
    expect(child(animation, 'backdropAnimation')!.elements).toEqual([
      root.querySelector('ion-backdrop'),
    ]);
    expect(child(animation, 'contentAnimation')!.elements).toEqual([
      el.querySelector('.ion-page'),
    ]);
  });

  it('leaves the content out when the sheet expands to scroll', () => {
    const animation = sheetEnterAnimation(modal(), {
      currentBreakpoint: 1,
      backdropBreakpoint: 0,
      expandToScroll: true,
    });

    expect(child(animation, 'contentAnimation')).toBeUndefined();
  });

  it('slides up to its breakpoint', () => {
    const animation = sheetEnterAnimation(modal(), {
      currentBreakpoint: 0.08,
      backdropBreakpoint: 0.5,
      expandToScroll: true,
    });

    expect(child(animation, 'wrapperAnimation')!.getKeyframes()).toEqual([
      { offset: 0, opacity: 1, transform: 'translateY(100%)' },
      { offset: 1, opacity: 1, transform: 'translateY(92%)' },
    ]);
  });

  it('shows no scrim below the backdrop breakpoint (the calendar drawer)', () => {
    const backdrop = (currentBreakpoint: number) =>
      child(
        sheetEnterAnimation(modal(), {
          currentBreakpoint,
          backdropBreakpoint: 0.5,
          expandToScroll: true,
        }),
        'backdropAnimation'
      )!.getKeyframes();

    expect(backdrop(0.08)).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: '0' },
    ]);
    expect(backdrop(1)).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 'calc(var(--backdrop-opacity) * 1)' },
    ]);
  });
});

describe('sheetLeaveAnimation', () => {
  it('closes in 220 ms on the handoff curve', () => {
    const animation = sheetLeaveAnimation(modal(), {
      currentBreakpoint: 1,
      backdropBreakpoint: 0,
      expandToScroll: true,
    });

    expect(animation.getDuration()).toBe(SHEET_OUT_MS);
    expect(animation.getEasing()).toBe(SHEET_EASING);
    expect(child(animation, 'wrapperAnimation')!.getKeyframes()).toEqual([
      { offset: 0, opacity: 1, transform: 'translateY(0%)' },
      { offset: 1, opacity: 1, transform: 'translateY(100%)' },
    ]);
    expect(child(animation, 'backdropAnimation')!.getKeyframes()).toEqual([
      { offset: 0, opacity: 'calc(var(--backdrop-opacity) * 1)' },
      { offset: 1, opacity: 0 },
    ]);
  });

  it('fades the scrim out by the backdrop breakpoint', () => {
    const animation = sheetLeaveAnimation(modal(), {
      currentBreakpoint: 1,
      backdropBreakpoint: 0.5,
      expandToScroll: true,
    });

    expect(child(animation, 'backdropAnimation')!.getKeyframes()).toEqual([
      { offset: 0, opacity: 'calc(var(--backdrop-opacity) * 1)' },
      { offset: 0.5, opacity: 0 },
      { offset: 1, opacity: 0 },
    ]);
  });
});
