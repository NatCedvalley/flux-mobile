import { signal } from '@angular/core';

/** Hold this long, without moving, to pick a card up. */
export const LONG_PRESS_MS = 400;
/** Moving further than this before the pickup is a scroll, not a drag. */
export const SLOP_PX = 8;
/** A finger this close to the screen's side advances the columns… */
export const EDGE_PX = 40;
/** …after resting there this long, and again for as long as it stays. */
export const EDGE_DWELL_MS = 500;

/** The card being dragged, and the column it came from. */
export type Pickup = { taskId: string; columnKey: string };

export type BoardDragOptions = {
  /** The horizontal column scroller, which the edge advances. */
  scroller: () => HTMLElement | undefined;
  /** One column's width plus the gap: how far an edge advance scrolls. */
  step: number;
  /** Whether cards may be picked up at all (EDITOR+). */
  enabled: () => boolean;
  picked: (pickup: Pickup) => void;
  /** The card was let go over `columnKey` (undefined: outside any column). */
  dropped: (pickup: Pickup, columnKey: string | undefined) => void;
};

type Press = {
  pointerId: number;
  x: number;
  y: number;
  card: HTMLElement;
  pickup: Pickup;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * The board's cross-column drag (handoff 3c), on pointer events, since
 * `ion-reorder-group` only reorders vertically. A long press picks a card
 * up (`[data-task-id]` inside a `[data-column]`); a ghost copy then follows
 * the finger, `over` names the column under it, and resting at a screen
 * edge scrolls one column that way. Once a card is up, `touchmove` is
 * cancelled so the browser never starts its own scroll (which would cancel
 * the pointer). The click that follows a drop is swallowed, so the card's
 * link doesn't open.
 */
export class BoardDrag {
  readonly dragging = signal<Pickup | undefined>(undefined);
  readonly over = signal<string | undefined>(undefined);

  private press: Press | undefined;
  private ghost: HTMLElement | undefined;
  private grab = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };
  private edge:
    { dir: number; timer: ReturnType<typeof setTimeout> } | undefined;
  private swallowClick = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly options: BoardDragOptions
  ) {}

  /** Starts listening; returns the function that stops it. */
  attach(): () => void {
    const doc = this.host.ownerDocument;
    const listeners: [
      EventTarget,
      string,
      EventListener,
      AddEventListenerOptions?,
    ][] = [
      [this.host, 'pointerdown', (e) => this.down(e as PointerEvent)],
      [doc, 'pointermove', (e) => this.move(e as PointerEvent)],
      [doc, 'pointerup', (e) => this.up(e as PointerEvent)],
      [doc, 'pointercancel', (e) => this.cancel(e as PointerEvent)],
      [doc, 'touchmove', (e) => this.touchMove(e), { passive: false }],
      [this.host, 'contextmenu', (e) => this.contextMenu(e)],
      [this.host, 'click', (e) => this.click(e), { capture: true }],
    ];
    for (const [target, type, listener, opts] of listeners) {
      target.addEventListener(type, listener, opts);
    }
    return () => {
      this.reset();
      for (const [target, type, listener, opts] of listeners) {
        target.removeEventListener(type, listener, opts);
      }
    };
  }

  /** The scroller moved under a held card: the column under it changed. */
  scrolled(): void {
    if (this.dragging()) {
      this.over.set(this.columnAt(this.last.x, this.last.y));
    }
  }

  private down(event: PointerEvent): void {
    if (this.press || this.dragging() || event.button !== 0) {
      return;
    }
    const target = event.target as Element | null;
    const card = target?.closest<HTMLElement>('[data-task-id]');
    const column = card?.closest<HTMLElement>('[data-column]');
    const taskId = card?.dataset['taskId'];
    const columnKey = column?.dataset['column'];
    if (!card || !taskId || !columnKey || !this.options.enabled()) {
      return;
    }
    this.press = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      card,
      pickup: { taskId, columnKey },
      timer: setTimeout(() => this.pickUp(), LONG_PRESS_MS),
    };
  }

  private pickUp(): void {
    const press = this.press;
    if (!press) {
      return;
    }
    const rect = press.card.getBoundingClientRect();
    this.grab = { x: press.x - rect.left, y: press.y - rect.top };
    this.last = { x: press.x, y: press.y };
    const ghost = press.card.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-task-id');
    ghost.classList.add('board-ghost');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${rect.width}px`,
      margin: '0',
      zIndex: '1000',
      pointerEvents: 'none',
      borderRadius: 'var(--flux-radius-card-lg)',
      boxShadow: 'var(--flux-shadow-lifted)',
    });
    this.host.ownerDocument.body.appendChild(ghost);
    this.ghost = ghost;
    this.place();
    this.dragging.set(press.pickup);
    this.over.set(press.pickup.columnKey);
    this.options.picked(press.pickup);
  }

  private move(event: PointerEvent): void {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) {
      return;
    }
    if (!this.dragging()) {
      if (
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX
      ) {
        this.reset();
      }
      return;
    }
    this.last = { x: event.clientX, y: event.clientY };
    this.place();
    this.over.set(this.columnAt(event.clientX, event.clientY));
    this.watchEdge(event.clientX);
  }

  private up(event: PointerEvent): void {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) {
      return;
    }
    const pickup = this.dragging();
    const over = this.columnAt(event.clientX, event.clientY);
    this.reset();
    if (pickup) {
      this.swallowClick = true;
      // A click that never comes (the finger left the card) mustn't
      // swallow the next tap.
      setTimeout(() => (this.swallowClick = false), 400);
      this.options.dropped(pickup, over);
    }
  }

  private cancel(event: PointerEvent): void {
    if (this.press?.pointerId === event.pointerId) {
      this.reset();
    }
  }

  private touchMove(event: Event): void {
    if (this.dragging() && event.cancelable) {
      event.preventDefault();
    }
  }

  private contextMenu(event: Event): void {
    if (this.press || this.dragging()) {
      event.preventDefault();
    }
  }

  private click(event: Event): void {
    if (this.swallowClick) {
      this.swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /** Keeps the ghost under the finger, where it was grabbed. */
  private place(): void {
    if (this.ghost) {
      const x = this.last.x - this.grab.x;
      const y = this.last.y - this.grab.y;
      this.ghost.style.transform = `translate(${x}px, ${y}px) rotate(2deg)`;
    }
  }

  private columnAt(x: number, y: number): string | undefined {
    const element = this.host.ownerDocument.elementFromPoint(x, y);
    const column = element?.closest<HTMLElement>('[data-column]');
    return column && this.host.contains(column)
      ? column.dataset['column']
      : undefined;
  }

  /** Arms the edge advance while the finger rests near a side. */
  private watchEdge(x: number): void {
    const width = this.host.ownerDocument.documentElement.clientWidth;
    const dir = x < EDGE_PX ? -1 : x > width - EDGE_PX ? 1 : 0;
    if (dir === (this.edge?.dir ?? 0)) {
      return;
    }
    this.stopEdge();
    if (dir) {
      this.edge = {
        dir,
        timer: setTimeout(() => this.advance(dir), EDGE_DWELL_MS),
      };
    }
  }

  private advance(dir: number): void {
    this.options
      .scroller()
      ?.scrollBy({ left: dir * this.options.step, behavior: 'smooth' });
    this.edge = {
      dir,
      timer: setTimeout(() => this.advance(dir), EDGE_DWELL_MS),
    };
  }

  private stopEdge(): void {
    if (this.edge) {
      clearTimeout(this.edge.timer);
      this.edge = undefined;
    }
  }

  /**
   * Drops a press that hasn't picked its card up yet, e.g. because the
   * pull-to-refresh took the gesture. A card already held stays held.
   */
  abortPress(): void {
    if (this.press && !this.dragging()) {
      this.reset();
    }
  }

  private reset(): void {
    if (this.press) {
      clearTimeout(this.press.timer);
      this.press = undefined;
    }
    this.stopEdge();
    this.ghost?.remove();
    this.ghost = undefined;
    this.dragging.set(undefined);
    this.over.set(undefined);
  }
}
