import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Task, WorkflowStatus } from '@core/api';
import {
  COLUMN_SCROLL_MS,
  COLUMN_SCROLL_PX,
  EDGE_DWELL_MS,
  LONG_PRESS_MS,
} from './board-drag';
import {
  type BoardColumn,
  type BoardDrop,
  GLIDE_AFTER_MS,
  TaskBoardComponent,
} from './task-board.component';

const STATUSES: WorkflowStatus[] = [
  { slug: 'backlog', name: 'Backlog', category: 'PLANNING' },
  { slug: 'todo', name: 'To Do', category: 'TODO', color: 'blue' },
  { slug: 'doing', name: 'In Progress', category: 'IN_PROGRESS' },
  { slug: 'done', name: 'Done', category: 'DONE', isClosed: true },
];

function column(
  status: WorkflowStatus,
  tasks: Task[],
  complete = true
): BoardColumn {
  return {
    status,
    loaded: {
      group: { key: status.slug!, label: status.name!, hue: 'gray', query: {} },
      tasks,
      total: complete ? tasks.length : tasks.length + 10,
      complete,
    },
  };
}

const TASK: Task = {
  id: 't1',
  projectId: 'p1',
  taskKey: 'CHK-1',
  title: 'Ship it',
  type: 'TASK',
  status: 'todo',
};

const COLUMNS = [
  column(STATUSES[0], []),
  column(STATUSES[1], [TASK, { ...TASK, id: 't2', taskKey: 'CHK-2' }]),
  column(STATUSES[2], [], false),
  column(STATUSES[3], []),
];

function pointer(type: string, x = 10, y = 10): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  return Object.assign(event, { pointerId: 1 });
}

describe('TaskBoardComponent', () => {
  let fixture: ComponentFixture<TaskBoardComponent>;
  let el: HTMLElement;
  let dropped: BoardDrop[];
  let loadMore: string[];
  let blocks: boolean[];
  /** What `elementFromPoint` finds: the column the finger is over. */
  let under: Element | null;

  function render(inputs: Record<string, unknown> = {}): void {
    for (const [name, value] of Object.entries({
      columns: COLUMNS,
      today: '2026-10-01',
      canMove: true,
      canCreate: true,
      ...inputs,
    })) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  const section = (key: string) =>
    el.querySelector<HTMLElement>(`section[data-column="${key}"]`)!;
  const card = (id = 't1') =>
    el.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!;
  const scroller = () => el.querySelector<HTMLElement>('.columns')!;

  /** Long-presses a card until it's picked up. */
  function pickUp(id = 't1'): void {
    card(id).querySelector('.title')!.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fixture.detectChanges();
  }

  function moveOver(key: string, x = 100, y = 20): void {
    under = section(key);
    document.dispatchEvent(pointer('pointermove', x, y));
    fixture.detectChanges();
  }

  function release(x = 100, y = 20): void {
    document.dispatchEvent(pointer('pointerup', x, y));
    fixture.detectChanges();
  }

  /** Lays a card out from `top`, 100px tall. */
  function layOut(id: string, top: number): void {
    card(id).getBoundingClientRect = () =>
      ({ top, bottom: top + 100, height: 100, left: 0, right: 296 }) as DOMRect;
  }

  beforeEach(async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    under = null;
    document.elementFromPoint = vi.fn(() => under);
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 375,
    });
    await TestBed.configureTestingModule({
      imports: [TaskBoardComponent],
      // Task detail's route, which a tap on a card opens.
      providers: [provideRouter([{ path: 'tasks/:p/:t', children: [] }])],
    }).compileComponents();
    fixture = TestBed.createComponent(TaskBoardComponent);
    el = fixture.nativeElement as HTMLElement;
    dropped = [];
    loadMore = [];
    blocks = [];
    fixture.componentInstance.dropped.subscribe((d) => dropped.push(d));
    fixture.componentInstance.loadMore.subscribe((k) => loadMore.push(k));
    fixture.componentInstance.blocksRefresh.subscribe((b) => blocks.push(b));
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('shows a rail pill with its count, and a column, per status', () => {
    render();

    expect(
      Array.from(el.querySelectorAll('.pill')).map((p) => p.textContent?.trim())
    ).toEqual(['Backlog 0', 'To Do 2', 'In Progress 10', 'Done 0']);
    expect(
      Array.from(el.querySelectorAll('section.column')).map(
        (c) => c.querySelector('.name')?.textContent
      )
    ).toEqual(['Backlog', 'To Do', 'In Progress', 'Done']);
    expect(section('todo').querySelectorAll('app-board-card')).toHaveLength(2);
  });

  it('scrolls to a column from its rail pill', () => {
    render();
    const scrollTo = vi.fn();
    scroller().scrollTo = scrollTo;

    (el.querySelectorAll('.pill')[2] as HTMLElement).click();

    expect(scrollTo).toHaveBeenCalledWith({ left: 616, behavior: 'smooth' });
  });

  it('ends each open column with Add task, but not a closed one', () => {
    render();
    const added: WorkflowStatus[] = [];
    fixture.componentInstance.add.subscribe((s) => added.push(s));

    expect(section('todo').querySelector('.add')?.textContent?.trim()).toBe(
      'Add task to To Do'
    );
    expect(section('done').querySelector('.add')).toBeNull();
    section('doing').querySelector<HTMLElement>('.add')!.click();
    expect(added).toEqual([STATUSES[2]]);
  });

  it('has no Add task without the create role', () => {
    render({ canCreate: false });

    expect(el.querySelector('.add')).toBeNull();
  });

  describe('reorder menu', () => {
    const THREE = [
      column(STATUSES[1], [
        TASK,
        { ...TASK, id: 't2', taskKey: 'CHK-2' },
        { ...TASK, id: 't3', taskKey: 'CHK-3' },
      ]),
    ];
    const board = () =>
      fixture.componentInstance as unknown as {
        reorderOpen(): boolean;
        reorderMoves(): { label: string; index: number; disabled: boolean }[];
        reorderTo(index: number): void;
      };
    const reorderButton = (id: string) =>
      card(id).querySelector<HTMLButtonElement>('button.reorder')!;

    it('gives each card a reorder button only while the column can be reordered', () => {
      render({ columns: THREE, canReorder: false });
      expect(el.querySelector('button.reorder')).toBeNull();

      render({ columns: THREE, canReorder: true });
      expect(reorderButton('t2').getAttribute('aria-label')).toBe(
        'Reorder CHK-2'
      );
      expect(reorderButton('t2').getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('offers the moves that change the order, and drops the card there', () => {
      render({ columns: THREE, canReorder: true });

      reorderButton('t1').click();
      expect(board().reorderOpen()).toBe(true);
      expect(
        board()
          .reorderMoves()
          .map((m) => [m.label, m.disabled])
      ).toEqual([
        ['Move to top', true],
        ['Move up', true],
        ['Move down', false],
        ['Move to bottom', false],
      ]);

      reorderButton('t2').click();
      expect(
        board()
          .reorderMoves()
          .map((m) => m.index)
      ).toEqual([0, 0, 2, 2]);
      board().reorderTo(2);

      expect(board().reorderOpen()).toBe(false);
      expect(dropped).toEqual([
        { task: THREE[0].loaded.tasks[1], status: STATUSES[1], index: 2 },
      ]);
    });

    it('never starts a drag from the reorder button', () => {
      render({ columns: THREE, canReorder: true });
      reorderButton('t1').dispatchEvent(pointer('pointerdown'));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      fixture.detectChanges();
      expect(card('t1').classList).not.toContain('picked');
    });
  });

  it('draws skeleton columns while loading', () => {
    render({ columns: undefined });

    expect(el.querySelector('.columns.skeleton')).not.toBeNull();
    expect(el.querySelectorAll('.skeleton-card')).toHaveLength(6);
  });

  it('shows skeleton cards until a column is whole, and Retry if it fails', () => {
    const doing = column(
      STATUSES[2],
      [{ ...TASK, id: 't3', status: 'doing' }],
      false
    );
    render({ columns: [COLUMNS[0], COLUMNS[1], doing, COLUMNS[3]] });
    expect(section('doing').querySelectorAll('.skeleton-card')).toHaveLength(3);
    expect(section('doing').querySelector('app-board-card')).toBeNull();

    render({ failed: new Set(['doing']) });
    expect(section('doing').querySelector('.skeleton-card')).toBeNull();
    section('doing')
      .querySelector<HTMLElement>('.more-error ion-button')!
      .click();
    expect(loadMore).toEqual(['doing']);
  });

  describe('drag', () => {
    it('picks a card up on a long press and drops it on another column', () => {
      render();
      pickUp();

      expect(document.querySelector('body > .board-ghost')).not.toBeNull();
      expect(card().classList).toContain('picked');
      expect(blocks).toEqual([true]);

      moveOver('doing');
      expect(section('doing').classList).toContain('over');
      release();

      expect(dropped).toEqual([
        { task: TASK, status: STATUSES[2], index: undefined },
      ]);
      expect(document.querySelector('.board-ghost')).toBeNull();
      expect(card().classList).not.toContain('picked');
      expect(blocks).toEqual([true, false]);
    });

    it('swallows the click that follows a drop, but not a later tap', () => {
      render();
      pickUp();
      moveOver('doing');
      release();

      const link = card().querySelector('a')!;
      const reached = vi.fn();
      link.addEventListener('click', reached);
      const first = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(first);
      expect(first.defaultPrevented).toBe(true);
      expect(reached).not.toHaveBeenCalled();

      link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(reached).toHaveBeenCalledTimes(1);
    });

    it('does nothing for a tap shorter than the long press', () => {
      render();
      card().dispatchEvent(pointer('pointerdown'));
      vi.advanceTimersByTime(LONG_PRESS_MS - 50);
      release();
      vi.advanceTimersByTime(100);

      expect(document.querySelector('.board-ghost')).toBeNull();
      expect(dropped).toEqual([]);
    });

    it('lets a finger that moves before the pickup scroll instead', () => {
      render();
      card().dispatchEvent(pointer('pointerdown', 10, 10));
      document.dispatchEvent(pointer('pointermove', 10, 30));
      vi.advanceTimersByTime(LONG_PRESS_MS);

      expect(document.querySelector('.board-ghost')).toBeNull();
    });

    it('stops the page scrolling while a card is held', () => {
      render();
      pickUp();

      const move = new Event('touchmove', { cancelable: true });
      document.dispatchEvent(move);

      expect(move.defaultPrevented).toBe(true);
    });

    it("dims a column the card's type can't use, and refuses the drop", () => {
      render();
      pickUp();
      moveOver('backlog');

      expect(section('backlog').classList).toContain('refused');
      expect(section('backlog').querySelector('.reason')?.textContent).toBe(
        'Epics and masters only'
      );
      expect(section('backlog').classList).not.toContain('over');
      release();

      expect(dropped).toEqual([]);
    });

    it('ignores a drop on its own column or outside the columns', () => {
      render();
      pickUp();
      moveOver('todo');
      release();
      pickUp();
      under = null;
      release();

      expect(dropped).toEqual([]);
    });

    it('drops beside the columns on the nearest one, within the edge zone', () => {
      render();
      // Scrolled to the end: the last column fills 47-343, nothing after it.
      section('done').getBoundingClientRect = () =>
        ({ top: 0, bottom: 500, left: 47, right: 343 }) as DOMRect;
      pickUp();
      under = null;
      release(360);
      expect(dropped).toEqual([
        { task: TASK, status: STATUSES[3], index: undefined },
      ]);

      pickUp();
      under = null;
      release(390);
      expect(dropped).toHaveLength(1);
    });

    it('advances a column after resting at the screen edge', () => {
      render();
      const scrollBy = vi.fn();
      scroller().scrollBy = scrollBy;
      pickUp();
      moveOver('todo', 360);

      vi.advanceTimersByTime(EDGE_DWELL_MS);
      expect(scrollBy).toHaveBeenCalledWith({ left: 308, behavior: 'smooth' });
      vi.advanceTimersByTime(EDGE_DWELL_MS);
      expect(scrollBy).toHaveBeenCalledTimes(2);

      moveOver('todo', 10);
      vi.advanceTimersByTime(EDGE_DWELL_MS);
      expect(scrollBy).toHaveBeenLastCalledWith({
        left: -308,
        behavior: 'smooth',
      });
    });

    describe('reorder', () => {
      const DOING = { ...TASK, id: 't3', taskKey: 'CHK-3', status: 'doing' };
      const REORDERABLE = [
        COLUMNS[0],
        COLUMNS[1],
        column(STATUSES[2], [DOING]),
        COLUMNS[3],
      ];

      beforeEach(() => {
        render({ columns: REORDERABLE, canReorder: true });
        layOut('t1', 0);
        layOut('t2', 110);
        layOut('t3', 0);
      });

      const gaps = () =>
        Array.from(el.querySelectorAll('.gap-before, .gap-after')).map(
          (c) =>
            `${c.getAttribute('data-task-id')} ${c.classList.contains('gap-before') ? 'before' : 'after'}`
        );

      it('closes up the held card and opens a gap where it already is', () => {
        pickUp('t1');

        expect(card('t1').classList).toContain('lifted');
        expect(gaps()).toEqual(['t2 before']);
        expect(scroller().style.getPropertyValue('--drop-gap')).toBe('100px');
      });

      it('slides the gap only once it has opened, and not as it closes', () => {
        pickUp('t1');
        expect(scroller().classList).not.toContain('gliding');

        vi.advanceTimersByTime(GLIDE_AFTER_MS);
        fixture.detectChanges();
        expect(scroller().classList).toContain('gliding');

        release();
        expect(scroller().classList).not.toContain('gliding');

        pickUp('t1');
        expect(scroller().classList).not.toContain('gliding');
      });

      it('opens the gap where a card will land in its own column, and drops it there', () => {
        pickUp('t1');
        moveOver('todo', 100, 200);

        expect(gaps()).toEqual(['t2 after']);
        release(100, 200);

        expect(dropped).toEqual([
          { task: TASK, status: STATUSES[1], index: 1 },
        ]);
        expect(gaps()).toEqual([]);
        expect(card('t1').classList).not.toContain('lifted');
      });

      it('drops nothing where the card already is', () => {
        pickUp('t1');
        moveOver('todo', 100, 20);
        release(100, 20);

        expect(dropped).toEqual([]);
      });

      it('gives the drop point in another column', () => {
        pickUp('t2');
        moveOver('doing', 100, 20);

        expect(gaps()).toEqual(['t3 before']);
        release(100, 20);

        expect(dropped).toEqual([
          { task: COLUMNS[1].loaded.tasks[1], status: STATUSES[2], index: 0 },
        ]);
      });

      it('gives no drop point in a column still loading', () => {
        render({ columns: COLUMNS });
        pickUp('t1');
        moveOver('doing');

        expect(gaps()).toEqual([]);
        release();

        expect(dropped[0].index).toBeUndefined();
      });

      it('only moves across columns without the reorder role or with filters', () => {
        render({ columns: REORDERABLE, canReorder: false });
        pickUp('t1');
        expect(card('t1').classList).toContain('picked');
        expect(card('t1').classList).not.toContain('lifted');
        moveOver('todo', 100, 200);
        expect(gaps()).toEqual([]);
        release(100, 200);
        expect(dropped).toEqual([]);

        pickUp('t1');
        moveOver('doing', 100, 20);
        expect(gaps()).toEqual([]);
        release(100, 20);
        expect(dropped).toEqual([
          { task: TASK, status: STATUSES[2], index: undefined },
        ]);
      });

      it('scrolls a column while the card is held at its top or bottom', () => {
        const cards = section('todo').querySelector<HTMLElement>('.cards')!;
        let scrollTop = 100;
        Object.defineProperty(cards, 'scrollTop', {
          get: () => scrollTop,
          set: (value: number) => (scrollTop = value),
        });
        cards.getBoundingClientRect = () =>
          ({ top: 50, bottom: 450, left: 0, right: 296 }) as DOMRect;
        pickUp('t1');

        moveOver('todo', 100, 440);
        vi.advanceTimersByTime(COLUMN_SCROLL_MS * 3);
        expect(scrollTop).toBe(100 + COLUMN_SCROLL_PX * 3);

        moveOver('todo', 100, 200);
        vi.advanceTimersByTime(COLUMN_SCROLL_MS * 3);
        expect(scrollTop).toBe(100 + COLUMN_SCROLL_PX * 3);

        moveOver('todo', 100, 60);
        vi.advanceTimersByTime(COLUMN_SCROLL_MS);
        expect(scrollTop).toBe(100 + COLUMN_SCROLL_PX * 2);

        release(100, 60);
        vi.advanceTimersByTime(COLUMN_SCROLL_MS * 3);
        expect(scrollTop).toBe(100 + COLUMN_SCROLL_PX * 2);
      });
    });

    it('cancels on pointercancel, without a drop', () => {
      render();
      pickUp();
      moveOver('doing');
      document.dispatchEvent(pointer('pointercancel'));
      fixture.detectChanges();

      expect(document.querySelector('.board-ghost')).toBeNull();
      expect(dropped).toEqual([]);
    });

    it("doesn't pick a card up without the move role", () => {
      render({ canMove: false });
      pickUp();

      expect(document.querySelector('.board-ghost')).toBeNull();
    });

    it('lets the refresher take a press that has not picked up yet', () => {
      render();
      card().dispatchEvent(pointer('pointerdown'));
      fixture.componentInstance.cancelPress();
      vi.advanceTimersByTime(LONG_PRESS_MS);

      expect(document.querySelector('.board-ghost')).toBeNull();
    });

    it('keeps the refresher off for a touch in a scrolled column', () => {
      render();
      const cards = section('todo').querySelector('.cards')!;
      Object.defineProperty(cards, 'scrollTop', { value: 40 });

      card().dispatchEvent(pointer('pointerdown'));
      expect(blocks).toEqual([true]);
      release();
      expect(blocks).toEqual([true, false]);
    });
  });
});
