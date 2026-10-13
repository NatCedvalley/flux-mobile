import { signal } from '@angular/core';

/** Hold this long, without moving, to pick a card up. */
export const LONG_PRESS_MS = 400;
/** Moving further than this before the pickup is a scroll, not a drag. */
export const SLOP_PX = 8;
/** A finger this close to the screen's side advances the columns… */
export const EDGE_PX = 40;
/** …after resting there this long, and again for as long as it stays. */
export const EDGE_DWELL_MS = 500;

/** How far a drawn ghost floats above the finger. */
const GHOST_LIFT_PX = 16;

/** The card being dragged, and the column it came from. */
export type Pickup = { taskId: string; columnKey: string };

export type BoardDragOptions = {
  /** The horizontal column scroller, which the edge advances (none: no advance). */
  scroller: () => HTMLElement | undefined;
  /** One column's width plus the gap: how far an edge advance scrolls. */
  step: number;
  /** Whether cards may be picked up at all (EDITOR+). */
  enabled: () => boolean;
  picked: (pickup: Pickup) => void;
  /** The card was let go over `columnKey` (undefined: outside any column). */
  dropped: (pickup: Pickup, columnKey: string | undefined) => void;
  /**
   * Draws the ghost for a card, instead of a copy of it (the calendar's
   * drawer rows are far wider than the days they drop on). It is centred
   * above the finger.
   */
  ghost?: (card: HTMLElement) => HTMLElement;
  /**
   * Keeps a held card's touch and mouse moves from everything else on the
   * page, such as an `ion-modal` sheet's drag gesture, which would
   * otherwise move the sheet along with the card.
   */
  isolate?: boolean;
  /**
   * Places outside the host whose cards can be picked up too, and whose
   * columns take a drop: the calendar's drawer, which Ionic presents from
   * `ion-app`.
   */
  elsewhere?: () => readonly (Element | undefined)[];
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
    // Isolated, a held card's moves are stopped before anything else sees
    // them: at the window, in the capture phase.
    const moves: [EventTarget, AddEventListenerOptions] = this.options.isolate
      ? [doc.defaultView ?? doc, { passive: false, capture: true }]
      : [doc, { passive: false }];
    const listeners: [
      EventTarget,
      string,
      EventListener,
      AddEventListenerOptions?,
    ][] = [
      [doc, 'pointerdown', (e) => this.down(e as PointerEvent)],
      [doc, 'pointermove', (e) => this.move(e as PointerEvent)],
      [doc, 'pointerup', (e) => this.up(e as PointerEvent)],
      [doc, 'pointercancel', (e) => this.cancel(e as PointerEvent)],
      [moves[0], 'touchmove', (e) => this.touchMove(e), moves[1]],
      [doc, 'contextmenu', (e) => this.contextMenu(e)],
      [doc, 'click', (e) => this.click(e), { capture: true }],
    ];
    if (this.options.isolate) {
      listeners.push([
        moves[0],
        'mousemove',
        (e) => this.isolated(e),
        moves[1],
      ]);
    }
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
    if (!this.within(target)) {
      return;
    }
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
    const drawn = this.options.ghost?.(press.card);
    const ghost = drawn ?? (press.card.cloneNode(true) as HTMLElement);
    ghost.removeAttribute('data-task-id');
    ghost.classList.add('board-ghost');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      margin: '0',
      zIndex: '1000',
      pointerEvents: 'none',
      boxShadow: 'var(--flux-shadow-lifted)',
    });
    if (!drawn) {
      Object.assign(ghost.style, {
        width: `${rect.width}px`,
        borderRadius: 'var(--flux-radius-card-lg)',
      });
    }
    this.host.ownerDocument.body.appendChild(ghost);
    if (drawn) {
      // Centred above the finger, which would hide a small ghost.
      const size = ghost.getBoundingClientRect();
      this.grab = { x: size.width / 2, y: size.height + GHOST_LIFT_PX };
    }
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
    this.isolated(event);
  }

  private isolated(event: Event): void {
    if (this.dragging() && this.options.isolate) {
      event.stopPropagation();
    }
  }

  private contextMenu(event: Event): void {
    if ((this.press || this.dragging()) && this.within(event.target)) {
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

  /**
   * The column under the finger. Beside the columns (a gap, or past the
   * last one once the edge advance has reached the end), the nearest one
   * within the edge zone, level with the finger.
   */
  private columnAt(x: number, y: number): string | undefined {
    const element = this.host.ownerDocument.elementFromPoint(x, y);
    const column = element?.closest<HTMLElement>('[data-column]');
    if (column && this.within(column)) {
      return column.dataset['column'];
    }
    let nearest: { key: string | undefined; distance: number } | undefined;
    for (const candidate of this.host.querySelectorAll<HTMLElement>(
      '[data-column]'
    )) {
      const rect = candidate.getBoundingClientRect();
      if (y < rect.top || y > rect.bottom) {
        continue;
      }
      const distance = Math.max(rect.left - x, x - rect.right, 0);
      if (distance <= EDGE_PX && (!nearest || distance < nearest.distance)) {
        nearest = { key: candidate.dataset['column'], distance };
      }
    }
    return nearest?.key;
  }

  /** Whether `target` is in the host or one of the places `elsewhere`. */
  private within(target: EventTarget | null): boolean {
    return (
      target instanceof Node &&
      (this.host.contains(target) ||
        !!this.options.elsewhere?.().some((area) => area?.contains(target)))
    );
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
