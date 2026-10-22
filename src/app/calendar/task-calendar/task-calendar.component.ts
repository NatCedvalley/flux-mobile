import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonIcon,
  IonList,
  IonModal,
  type InfiniteScrollCustomEvent,
} from '@ionic/angular';
import type { ProjectTasksQuery, Task, WorkflowStatus } from '@core/api';
import {
  type CalendarDay,
  allPages,
  dayLines,
  isOverdueSpan,
  monthGrid,
  monthOf,
  monthTitle,
  monthWindow,
  rescheduleChange,
  shiftMonth,
  taskSpan,
  tasksByDay,
} from '@core/calendar';
import { dayMonth } from '@core/my-work';
import { DEFAULT_SORT, statusHue } from '@core/project-list';
import { PagedList, type PagedListState } from '@core/task-filters';
import { BoardDrag, type Pickup } from '../../board/task-board/board-drag';
import { WriteQueueService } from '../../offline/write-queue.service';
import { groupHueColors } from '../../projects/project-colors';
import { FLUX_API } from '../../providers/flux-api.token';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { ProjectTaskRowComponent } from '../../shared/project-task-row/project-task-row.component';
import { TaskEditService } from '../../task-edit/task-edit.service';
import { impact } from '../../task-status/haptics';
import { TaskChangesService } from '../../task-status/task-changes.service';
import { UnscheduledListComponent } from '../unscheduled-list/unscheduled-list.component';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * The Unscheduled drawer's stops (handoff 3d): its handle row, half the
 * screen, and full height. Below the half stop the calendar stays usable.
 */
export const DRAWER_BREAKPOINTS = [0.08, 0.5, 1];
const [COLLAPSED, HALF] = DRAWER_BREAKPOINTS;

/** The drag's key for the drawer's rows, which aren't on any day. */
export const UNSCHEDULED = 'unscheduled';
const DRAWER_PAGE_SIZE = 50;
/** The tab bar's id: toasts sit above it when the drawer isn't there. */
const TAB_BAR = 'tab-bar';

/**
 * The project calendar (handoff 3d): the month's tasks on a Monday-first
 * grid, each day showing two lines of stripe pills in their status's hue
 * (red once overdue) or one and `+n more`, which opens the day's tasks in
 * a sheet. A task with a planned range is on every day of it. The month
 * loads its whole window, page after page, again on every move. Under it
 * the Unscheduled drawer lists the tasks with no dates.
 *
 * For an EDITOR+, a long press picks up a pill or a drawer row
 * (`BoardDrag`), and a drop on a day reschedules it through the PUT that
 * keeps every other field (`TaskEditService.reschedule`, with Undo): a
 * planned range moves whole, anything else gets that day as its due date.
 *
 * Ionic presents the drawer from `ion-app`, outside the page, so it is
 * lifted above the tab bar (whose height it watches), the grid keeps its
 * collapsed height free, and the page hides it while it's off screen.
 */
@Component({
  selector: 'app-task-calendar',
  templateUrl: './task-calendar.component.html',
  styleUrls: ['./task-calendar.component.scss'],
  imports: [
    RouterLink,
    IonButton,
    IonIcon,
    IonList,
    IonModal,
    ErrorStateComponent,
    ProjectTaskRowComponent,
    UnscheduledListComponent,
  ],
  host: {
    '[style.padding-bottom.px]': 'drawerSpace()',
    '(window:resize)': 'liftDrawer()',
    '(document:pointerup)': 'released()',
    '(document:pointercancel)': 'released()',
  },
})
export class TaskCalendarComponent {
  private readonly api = inject(FLUX_API);
  private readonly edits = inject(TaskEditService);
  private readonly taskChanges = inject(TaskChangesService);
  /** Tasks with a status change still to send: their rows show the glyph. */
  protected readonly pendingTaskIds = inject(WriteQueueService).pendingTaskIds;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly drawer = viewChild<string, ElementRef<HTMLIonModalElement>>(
    'drawer',
    { read: ElementRef }
  );
  private readonly daySheet = viewChild<
    string,
    ElementRef<HTMLIonModalElement>
  >('daySheet', { read: ElementRef });

  readonly projectId = input.required<string>();
  /**
   * The list's filters and AI filter, as query params; undefined while the
   * project's settings load, which holds the tasks back.
   */
  readonly query = input<ProjectTasksQuery>();
  /** The project's workflow statuses, for the pills' hues. */
  readonly statuses = input<readonly WorkflowStatus[]>([]);
  readonly today = input.required<string>();
  /** Tasks can be dragged to another day (EDITOR+). */
  readonly canEdit = input(false);
  /** The month shown (`YYYY-MM`), kept by the page across reloads. */
  readonly month = model.required<string>();

  /** Whether the page's pull-to-refresh must stay off: a task is held. */
  readonly blocksRefresh = output<boolean>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly breakpoints = DRAWER_BREAKPOINTS;
  protected readonly collapsed = COLLAPSED;
  protected readonly unscheduledKey = UNSCHEDULED;

  protected readonly title = computed(() => monthTitle(this.month()));
  private readonly window = computed(() => monthWindow(this.month()));
  protected readonly weeks = computed(() =>
    monthGrid(this.month(), this.today())
  );

  /** Every task in the month's window, all pages of it. */
  protected readonly tasks = resource({
    params: () => {
      const query = this.query();
      return query
        ? { projectId: this.projectId(), query, ...this.window() }
        : undefined;
    },
    loader: ({ params: { projectId, query, from, to } }) =>
      allPages((page, size) =>
        this.api.listProjectTasks(projectId, {
          sort: DEFAULT_SORT,
          ...query,
          dueDateFrom: from,
          dueDateTo: to,
          page,
          size,
        })
      ),
  });
  private readonly scheduled = computed(() =>
    this.tasks.hasValue() ? this.tasks.value() : []
  );
  private readonly byDay = computed(() => {
    const { from, to } = this.window();
    return tasksByDay(this.scheduled(), from, to);
  });

  /** The unscheduled tasks, paged as the drawer scrolls. */
  private readonly list = new PagedList<Task>(DRAWER_PAGE_SIZE);
  protected readonly rows = signal<PagedListState<Task>>(this.list.state);
  protected readonly unscheduled = resource({
    params: () => {
      const query = this.query();
      return query ? { projectId: this.projectId(), query } : undefined;
    },
    loader: async ({ params: { projectId, query } }) => {
      await this.list.start((page, size) =>
        this.api.listProjectTasks(projectId, {
          sort: DEFAULT_SORT,
          ...query,
          onlyUnscheduled: true,
          page,
          size,
        })
      );
      return true;
    },
  });
  protected readonly moreFailed = signal(false);
  /** The drawer is above its handle row. */
  protected readonly expanded = signal(false);
  /** The drawer's collapsed height, kept free under the grid. */
  protected readonly drawerSpace = signal(0);

  /** Still loading: the page's pull-to-refresh waits for this. */
  readonly loading = computed(
    () => this.tasks.isLoading() || this.unscheduled.isLoading()
  );

  /** The day sheet, and the day it lists (kept while it closes). */
  protected readonly sheetOpen = signal(false);
  private readonly sheetDay = signal<string | undefined>(undefined);
  protected readonly sheetTasks = computed(() => {
    const day = this.sheetDay();
    return day ? (this.byDay().get(day) ?? []) : [];
  });
  protected readonly sheetTitle = computed(() => {
    const day = this.sheetDay();
    return day ? dayMonth(day, this.today()) : '';
  });

  protected readonly drag = new BoardDrag(this.host.nativeElement, {
    scroller: () => undefined,
    step: 0,
    enabled: () => this.canEdit(),
    picked: (pickup) => this.picked(pickup),
    dropped: (pickup, key) => this.drop(pickup, key),
    ghost: (card) => this.ghost(card),
    isolate: true,
    elsewhere: () => [this.drawer()?.nativeElement],
  });
  private refreshBlocked = false;
  /** Tasks with a reschedule on its way, which don't take another. */
  private readonly busy = new Set<string>();
  private tabBar: Element | undefined;
  private drawerShown = true;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(this.drag.attach());

    // The drawer stands on the tab bar, which changes height with the safe
    // area (and hides with the keyboard, which is no reason to move).
    afterNextRender(() => {
      this.tabBar =
        this.host.nativeElement
          .closest('ion-tabs')
          ?.querySelector('ion-tab-bar') ?? undefined;
      const observer =
        typeof ResizeObserver === 'undefined'
          ? undefined
          : new ResizeObserver(() => this.liftDrawer());
      if (this.tabBar) {
        observer?.observe(this.tabBar);
      }
      this.liftDrawer();
      destroyRef.onDestroy(() => observer?.disconnect());
    });

    this.list.onChange((state) => {
      this.rows.set(state);
      this.moreFailed.set(false);
    });

    // A task changed elsewhere (task detail) moves here too, and leaves
    // when it was archived or deleted.
    effect(() => {
      const change = this.taskChanges.changed();
      untracked(() => {
        if (change?.task.projectId === this.projectId()) {
          if (change.removed || change.task.isArchived) {
            this.remove(change.task);
          } else {
            this.show(change.task);
          }
        }
      });
    });
  }

  /** Reloads the month and the drawer (pull-to-refresh). */
  reload(): void {
    this.tasks.reload();
    this.unscheduled.reload();
  }

  /**
   * The page left the screen (task detail went over it, or another tab):
   * the drawer and the day sheet, which Ionic presents over everything, go
   * too. Called by the page, because Ionic stops checking a page's bindings
   * once it has left.
   */
  leave(): void {
    void this.daySheet()?.nativeElement.dismiss();
    if (this.drawerShown) {
      this.drawerShown = false;
      void this.drawer()?.nativeElement.dismiss();
    }
  }

  /** The page is back: the drawer returns, collapsed. */
  enter(): void {
    if (!this.drawerShown) {
      this.drawerShown = true;
      void this.drawer()?.nativeElement.present();
    }
  }

  /** The page's refresher started: a press can't become a drag now. */
  cancelPress(): void {
    this.drag.abortPress();
  }

  protected go(months: number): void {
    this.month.update((month) => shiftMonth(month, months));
  }

  protected goToday(): void {
    this.month.set(monthOf(this.today()));
  }

  protected lines(day: CalendarDay): { pills: Task[]; more: number } {
    return dayLines(this.byDay().get(day.iso) ?? []);
  }

  protected hasTasks(day: CalendarDay): boolean {
    return !!this.byDay().get(day.iso)?.length;
  }

  /** `13 Oct, 2 tasks`, for screen readers. */
  protected dayLabel(day: CalendarDay): string {
    const count = this.byDay().get(day.iso)?.length ?? 0;
    const date = dayMonth(day.iso, this.today());
    return count ? `${date}, ${count} task${count === 1 ? '' : 's'}` : date;
  }

  /** A pill's stripe and wash: its status's hue, or red once overdue. */
  protected pillColors(task: Task): Record<string, string> {
    if (isOverdueSpan(task, this.today())) {
      return groupHueColors('red');
    }
    const status = this.statuses().find((s) => s.slug === task.status);
    return groupHueColors(
      statusHue(status?.color, status?.category ?? task.statusCategory)
    );
  }

  protected overdue(task: Task): boolean {
    return isOverdueSpan(task, this.today());
  }

  protected isPicked(task: Task): boolean {
    return this.drag.dragging()?.taskId === task.id;
  }

  protected isOver(day: CalendarDay): boolean {
    return !!this.drag.dragging() && this.drag.over() === day.iso;
  }

  /** A tap on a day, outside its pills: the day's tasks in a sheet. */
  protected openDay(day: CalendarDay, event: Event): void {
    if (!(event.target as Element | null)?.closest('a') && this.hasTasks(day)) {
      this.openSheet(day.iso);
    }
  }

  protected openSheet(day: string): void {
    this.sheetDay.set(day);
    this.sheetOpen.set(true);
  }

  /** The handle row: up to half the screen, or back down. */
  protected toggleDrawer(): void {
    void this.drawer()?.nativeElement.setCurrentBreakpoint(
      this.expanded() ? COLLAPSED : HALF
    );
  }

  protected breakpointChanged(
    event: CustomEvent<{ breakpoint: number }>
  ): void {
    this.expanded.set(event.detail.breakpoint > COLLAPSED);
  }

  protected loadMore(event: InfiniteScrollCustomEvent): void {
    void this.nextPage().finally(() => void event.target.complete());
  }

  protected retryMore(): void {
    void this.nextPage();
  }

  protected released(): void {
    if (!this.drag.dragging()) {
      this.blockRefresh(false);
    }
  }

  private picked(pickup: Pickup): void {
    void impact('light');
    this.blockRefresh(true);
    if (pickup.columnKey === UNSCHEDULED) {
      // Out of the way, so every day can take the drop.
      void this.drawer()?.nativeElement.setCurrentBreakpoint(COLLAPSED);
    }
  }

  /** A held task let go over `key`: a day, the drawer, or nothing. */
  protected drop(pickup: Pickup, key: string | undefined): void {
    this.blockRefresh(false);
    const task = this.find(pickup.taskId);
    if (!task?.id || !key || key === UNSCHEDULED || this.busy.has(task.id)) {
      return;
    }
    const from =
      pickup.columnKey === UNSCHEDULED ? undefined : pickup.columnKey;
    const change = rescheduleChange(task, from, key);
    if (!change) {
      return;
    }
    void impact('medium');
    const id = task.id;
    this.busy.add(id);
    void this.edits
      .reschedule(task, change, {
        apply: (t) => this.show(t),
        // Above the drawer's handle row, which stands on the tab bar.
        anchor:
          this.drawer()?.nativeElement.querySelector<HTMLElement>(
            '.drawer-head'
          ) ?? TAB_BAR,
      })
      .finally(() => this.busy.delete(id));
  }

  /**
   * Shows a task where its dates now put it: on the month's days it
   * covers, or in the drawer with none. One the filters no longer let in
   * leaves.
   */
  private show(task: Task): void {
    const statuses = this.query()?.status?.split(',') ?? [];
    if (statuses.length && !statuses.includes(task.status ?? '')) {
      this.remove(task);
      return;
    }
    const span = taskSpan(task);
    const { from, to } = this.window();
    const inMonth = !!span && span.start <= to && span.end >= from;
    if (this.tasks.hasValue()) {
      this.tasks.update((tasks) => {
        const rest = (tasks ?? []).filter((t) => t.id !== task.id);
        if (!inMonth) {
          return rest;
        }
        const index = (tasks ?? []).findIndex((t) => t.id === task.id);
        return index < 0
          ? [task, ...rest]
          : [...rest.slice(0, index), task, ...rest.slice(index)];
      });
    }
    const listed = this.rows().items.some((t) => t.id === task.id);
    if (span && listed) {
      this.list.edit((items) => items.filter((t) => t.id !== task.id), -1);
    } else if (!span && listed) {
      this.list.edit((items) =>
        items.map((t) => (t.id === task.id ? task : t))
      );
    } else if (!span && this.unscheduled.hasValue()) {
      this.list.edit((items) => [task, ...items], 1);
    }
  }

  private remove(task: Task): void {
    if (this.tasks.hasValue()) {
      this.tasks.update((tasks) => tasks?.filter((t) => t.id !== task.id));
    }
    if (this.rows().items.some((t) => t.id === task.id)) {
      this.list.edit((items) => items.filter((t) => t.id !== task.id), -1);
    }
  }

  private find(taskId: string): Task | undefined {
    return (
      this.scheduled().find((t) => t.id === taskId) ??
      this.rows().items.find((t) => t.id === taskId)
    );
  }

  /** The held task as a pill a little larger than a day's, on the surface. */
  private ghost(card: HTMLElement): HTMLElement {
    const task = this.find(card.dataset['taskId'] ?? '');
    const ghost = card.ownerDocument.createElement('div');
    ghost.textContent = task?.taskKey ?? '';
    for (const [name, value] of Object.entries(
      task ? this.pillColors(task) : {}
    )) {
      ghost.style.setProperty(name, value);
    }
    Object.assign(ghost.style, {
      padding: '0 var(--flux-space-8)',
      borderLeft: '3px solid var(--group-dot)',
      borderRadius: 'var(--flux-radius-code)',
      background:
        'linear-gradient(var(--group-wash), var(--group-wash)), var(--flux-surface)',
      color: 'var(--flux-n12)',
      font: 'var(--flux-font-meta-strong)',
      lineHeight: '24px',
      whiteSpace: 'nowrap',
    });
    return ghost;
  }

  /**
   * Stands the drawer on the tab bar, and keeps its handle row free under
   * the grid: the drawer spans the screen above the bar, so its collapsed
   * stop is that fraction of the bar's top.
   */
  protected liftDrawer(): void {
    const drawer = this.drawer()?.nativeElement;
    const bar = this.tabBar?.getBoundingClientRect();
    if (!drawer || (bar && !bar.height)) {
      return;
    }
    const doc = this.host.nativeElement.ownerDocument;
    drawer.style.setProperty('--drawer-bottom', `${bar?.height ?? 0}px`);
    this.drawerSpace.set(
      COLLAPSED * (bar?.top ?? doc.documentElement.clientHeight)
    );
  }

  private blockRefresh(blocked: boolean): void {
    if (blocked !== this.refreshBlocked) {
      this.refreshBlocked = blocked;
      this.blocksRefresh.emit(blocked);
    }
  }

  /** Loads the drawer's next page; a failure shows its Retry. */
  private async nextPage(): Promise<void> {
    try {
      await this.list.loadMore();
    } catch (error) {
      console.error('Loading more unscheduled tasks failed', error);
      this.moreFailed.set(true);
    }
  }
}
