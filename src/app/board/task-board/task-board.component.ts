import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
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

export type BoardDrop = { task: Task; status: WorkflowStatus };

/** A column's width (3c: 296px, so the next one peeks) and the gap after it. */
export const COLUMN_WIDTH = 296;
export const COLUMN_GAP = 12;

/**
 * The project board (handoff 3c): a rail of status pills with counts, which
 * follows the columns and jumps to one, over 296px columns that snap as
 * they scroll sideways, the next one peeking. Each column's head stays put
 * while its cards scroll, and each column pages on its own as its end comes
 * into view. For an EDITOR+, a long press picks a card up to drag it to
 * another column (`BoardDrag`); a column its type can't use dims and says
 * why, and refuses the drop. With no columns yet, it draws skeleton cards.
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
  /** Columns end with Add task (EDITOR+), except closed ones. */
  readonly canCreate = input(false);
  /** Columns whose next page failed, which show Retry instead. */
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
    picked: () => {
      void impact('light');
      this.blockRefresh(true);
    },
    dropped: (pickup, key) => this.drop(pickup, key),
  });

  private refreshBlocked = false;

  /** The column the rail marks: the one scrolled to. */
  protected readonly active = signal(0);
  /** The held card's task, for the columns to say whether they take it. */
  private readonly held = computed(() => {
    const pickup = this.drag.dragging();
    return pickup && this.find(pickup)?.task;
  });

  protected readonly skeletonColumns = [0, 1];
  protected readonly skeletonCards = [0, 1, 2];

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(this.drag.attach());

    // Each column's end, coming into view, pages that column. Observing
    // again after each render reports a sentinel still in view, so a short
    // page keeps loading until the column fills.
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver((entries) => {
            for (const entry of entries) {
              const key = (entry.target as HTMLElement).dataset['more'];
              if (entry.isIntersecting && key) {
                this.loadMore.emit(key);
              }
            }
          });
    afterRenderEffect(() => {
      this.columns();
      this.failed();
      if (observer) {
        this.observeSentinels(observer);
      }
    });
    destroyRef.onDestroy(() => observer?.disconnect());
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

  private drop(pickup: Pickup, key: string | undefined): void {
    const found = this.find(pickup);
    const target = this.columns()?.find((c) => c.loaded.group.key === key);
    if (
      !found ||
      !target ||
      target.status.slug === found.task.status ||
      blockedReason(found.task.type, target.status.category)
    ) {
      return;
    }
    this.dropped.emit({ task: found.task, status: target.status });
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

  private observeSentinels(observer: IntersectionObserver): void {
    observer.disconnect();
    for (const sentinel of this.host.nativeElement.querySelectorAll(
      '[data-more]'
    )) {
      observer.observe(sentinel);
    }
  }
}
