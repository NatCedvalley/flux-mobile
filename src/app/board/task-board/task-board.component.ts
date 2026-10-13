import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IonButton, IonIcon, IonSkeletonText } from '@ionic/angular';
import type { Task, WorkflowStatus } from '@core/api';
import { type LoadedGroup, statusHue } from '@core/project-list';
import { blockedReason } from '@core/task-status';
import { groupHueColors } from '../../projects/project-colors';
import { impact } from '../../task-status/haptics';
import { BoardCardComponent } from '../board-card/board-card.component';
import { BoardDrag, type Pickup } from './board-drag';

/** A board column: its status and the rows loaded so far. */
export type BoardColumn = { status: WorkflowStatus; loaded: LoadedGroup };

/**
 * A card let go over a column that takes it. `index` is where among that
 * column's other cards it was let go, or undefined when the column can't be
 * reordered: then the card goes where the board order puts it.
 */
export type BoardDrop = {
  task: Task;
  status: WorkflowStatus;
  index: number | undefined;
};

/**
 * A column's width (3c: 296px, so the columns either side peek) and the
 * gap after it. Columns snap to the centre, so scrolling one column is
 * always this step.
 */
export const COLUMN_WIDTH = 296;
export const COLUMN_GAP = 12;
/** After a pickup, the gap starts sliding as it moves once this has passed. */
export const GLIDE_AFTER_MS = 100;

/**
 * The project board (handoff 3c): a rail of status pills with counts, which
 * follows the columns and jumps to one, over 296px columns that snap to
 * the centre as they scroll sideways, their neighbours peeking either side.
 * Each column's head stays put
 * while its cards scroll. A column shows skeleton cards until it is loaded
 * whole, in board order, and Retry if a page fails. For an EDITOR+, a long
 * press picks a card up to drag it to another column (`BoardDrag`); a
 * column its type can't use dims and says why, and refuses the drop. Where
 * columns can be reordered (`canReorder`, and the column loaded), the held
 * card's place closes up and a gap opens where it will land, in its own
 * column or another, and holding it at a column's top or bottom scrolls
 * that column. With no
 * columns yet, it draws skeleton cards.
 */
@Component({
  selector: 'app-task-board',
  templateUrl: './task-board.component.html',
  styleUrls: ['./task-board.component.scss'],
  imports: [BoardCardComponent, IonButton, IonIcon, IonSkeletonText],
  host: {
    '(pointerdown)': 'pressed($event)',
    '(document:pointerup)': 'released()',
    '(document:pointercancel)': 'released()',
  },
})
export class TaskBoardComponent {
  /** The columns in workflow order; undefined while the board loads. */
  readonly columns = input<readonly BoardColumn[]>();
  readonly today = input.required<string>();
  /** Cards can be dragged (EDITOR+). */
  readonly canMove = input(false);
  /**
   * Cards can be placed within a column (EDITOR+, with no filters, which
   * would leave a column partial).
   */
  readonly canReorder = input(false);
  /** Columns end with Add task (EDITOR+), except closed ones. */
  readonly canCreate = input(false);
  /** Columns whose loading failed, which show Retry instead. */
  readonly failed = input<ReadonlySet<string>>(new Set());

  readonly loadMore = output<string>();
  readonly dropped = output<BoardDrop>();
  readonly add = output<WorkflowStatus>();
  /**
   * Whether the page's pull-to-refresh must stay off: while a card is held,
   * and for a touch that starts in a column already scrolled down (which
   * Ionic's gesture refresher, seeing the page at its top, would take).
   */
  readonly blocksRefresh = output<boolean>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');

  protected readonly drag = new BoardDrag(this.host.nativeElement, {
    scroller: () => this.scroller()?.nativeElement,
    step: COLUMN_WIDTH + COLUMN_GAP,
    enabled: () => this.canMove(),
    picked: (pickup) => {
      void impact('light');
      this.blockRefresh(true);
      // Measured before its place closes up.
      this.gapHeight.set(
        this.cardElement(pickup.taskId)?.getBoundingClientRect().height ?? 0
      );
      // The gap opens where the card was without sliding, or the cards
      // under it would jump up as its place closes, then slide back.
      this.settled.set(false);
      clearTimeout(this.settling);
      this.settling = setTimeout(() => this.settled.set(true), GLIDE_AFTER_MS);
    },
    dropped: (pickup, key, slot) => this.drop(pickup, key, slot),
    columnScroller: (key) =>
      this.columnElement(key)?.querySelector<HTMLElement>('.cards') ??
      undefined,
  });

  private refreshBlocked = false;

  /** The column the rail marks: the one scrolled to. */
  protected readonly active = signal(0);
  /** The held card's task, for the columns to say whether they take it. */
  private readonly held = computed(() => {
    const pickup = this.drag.dragging();
    return pickup && this.find(pickup)?.task;
  });

  /** The held card's height: the gap opened where it will land. */
  protected readonly gapHeight = signal(0);
  private readonly settled = signal(false);
  private settling: ReturnType<typeof setTimeout> | undefined;
  /**
   * Whether the gap slides as it moves: only while a card is held, and not
   * as it first opens. A drop takes it away at once too, as the card
   * reappears.
   */
  protected readonly gliding = computed(
    () => !!this.drag.dragging() && this.settled()
  );

  /**
   * Where the held card will land, while it's over a column that can be
   * reordered: the column's key, and the card the gap opens above
   * (undefined: below the last one). It shows where the card already is,
   * too, though a drop there changes nothing.
   */
  protected readonly gap = computed(() => {
    const key = this.drag.over();
    const slot = this.drag.slot();
    const task = this.held();
    const column = this.columns()?.find((c) => c.loaded.group.key === key);
    if (
      !task ||
      !column ||
      slot === undefined ||
      this.refusal(column) ||
      !this.reorderable(column)
    ) {
      return undefined;
    }
    const others = column.loaded.tasks.filter((t) => t.id !== task.id);
    return others.length ? { key, before: others[slot]?.id } : undefined;
  });

  protected readonly skeletonColumns = [0, 1];
  protected readonly skeletonCards = [0, 1, 2];

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(this.drag.attach());
    destroyRef.onDestroy(() => clearTimeout(this.settling));
  }

  protected hueColors(status: WorkflowStatus): Record<string, string> {
    return groupHueColors(statusHue(status.color, status.category));
  }

  protected name(status: WorkflowStatus): string {
    return status.name ?? status.slug ?? '';
  }

  /** Why the held card can't go in this column, while one is held. */
  protected refusal(column: BoardColumn): string | undefined {
    const task = this.held();
    return task && column.status.slug !== task.status
      ? blockedReason(task.type, column.status.category)
      : undefined;
  }

  protected isPicked(task: Task): boolean {
    return this.drag.dragging()?.taskId === task.id;
  }

  /**
   * Whether the held card's place closes up: where cards can be reordered,
   * a gap shows where it will land instead.
   */
  protected isLifted(task: Task): boolean {
    return this.isPicked(task) && this.canReorder();
  }

  /** Whether the gap opens above this card. */
  protected gapBefore(column: BoardColumn, task: Task): boolean {
    const gap = this.gap();
    return gap?.key === column.loaded.group.key && gap.before === task.id;
  }

  /** Whether the gap opens below this card, the column's last other one. */
  protected gapAfter(column: BoardColumn, task: Task): boolean {
    const gap = this.gap();
    if (gap?.key !== column.loaded.group.key || gap.before !== undefined) {
      return false;
    }
    const held = this.drag.dragging()?.taskId;
    return column.loaded.tasks.filter((t) => t.id !== held).at(-1) === task;
  }

  /** The page's refresher started: a press can't become a drag now. */
  cancelPress(): void {
    this.drag.abortPress();
  }

  protected pressed(event: PointerEvent): void {
    const cards = (event.target as Element | null)?.closest('.cards');
    if (cards && cards.scrollTop > 0) {
      this.blockRefresh(true);
    }
  }

  protected released(): void {
    this.blockRefresh(false);
  }

  /** The rail's pill: scrolls its column into view. */
  protected jump(index: number): void {
    this.scroller()?.nativeElement.scrollTo({
      left: index * (COLUMN_WIDTH + COLUMN_GAP),
      behavior: 'smooth',
    });
  }

  protected scrolled(): void {
    const scroller = this.scroller()?.nativeElement;
    if (!scroller) {
      return;
    }
    const index = Math.round(scroller.scrollLeft / (COLUMN_WIDTH + COLUMN_GAP));
    if (index !== this.active()) {
      this.active.set(index);
      const pills = this.rail()?.nativeElement.querySelectorAll('button');
      pills?.[index]?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
    this.drag.scrolled();
  }

  private drop(
    pickup: Pickup,
    key: string | undefined,
    slot: number | undefined
  ): void {
    const found = this.find(pickup);
    const target = this.columns()?.find((c) => c.loaded.group.key === key);
    if (!found || !target) {
      return;
    }
    const index = this.reorderable(target) ? slot : undefined;
    if (target.status.slug === found.task.status) {
      if (index !== undefined && !this.unchanged(target, found.task, index)) {
        this.dropped.emit({ task: found.task, status: target.status, index });
      }
      return;
    }
    if (!blockedReason(found.task.type, target.status.category)) {
      this.dropped.emit({ task: found.task, status: target.status, index });
    }
  }

  /** Whether a card can be placed within the column: it's loaded whole. */
  private reorderable(column: BoardColumn): boolean {
    return this.canReorder() && column.loaded.complete;
  }

  /** Whether `index` is where `task` already is in its own column. */
  private unchanged(column: BoardColumn, task: Task, index: number): boolean {
    return (
      column.status.slug === task.status &&
      column.loaded.tasks.findIndex((t) => t.id === task.id) === index
    );
  }

  private cardElement(taskId: string): HTMLElement | undefined {
    return [
      ...this.host.nativeElement.querySelectorAll<HTMLElement>(
        '[data-task-id]'
      ),
    ].find((card) => card.dataset['taskId'] === taskId);
  }

  private columnElement(key: string): HTMLElement | undefined {
    return [
      ...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-column]'),
    ].find((column) => column.dataset['column'] === key);
  }

  private blockRefresh(blocked: boolean): void {
    if (blocked !== this.refreshBlocked) {
      this.refreshBlocked = blocked;
      this.blocksRefresh.emit(blocked);
    }
  }

  private find(pickup: Pickup): { task: Task } | undefined {
    const task = this.columns()
      ?.find((c) => c.loaded.group.key === pickup.columnKey)
      ?.loaded.tasks.find((t) => t.id === pickup.taskId);
    return task && { task };
  }
}
