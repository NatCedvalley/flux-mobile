import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Task, WorkflowStatus } from '@core/api';
import { EDGE_DWELL_MS, LONG_PRESS_MS } from './board-drag';
import {
  type BoardColumn,
  type BoardDrop,
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

/** Records what IntersectionObserver watches, and reports it on demand. */
class FakeObserver {
  static last: FakeObserver | undefined;
  readonly watched = new Set<Element>();
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.last = this;
  }
  observe(el: Element): void {
    this.watched.add(el);
  }
  disconnect(): void {
    this.watched.clear();
  }
  report(el: Element): void {
    this.callback(
      [
        {
          target: el,
          isIntersecting: true,
        } as unknown as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver
    );
  }
}

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

  function moveOver(key: string, x = 100): void {
    under = section(key);
    document.dispatchEvent(pointer('pointermove', x, 20));
    fixture.detectChanges();
  }

  function release(): void {
    document.dispatchEvent(pointer('pointerup', 100, 20));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('IntersectionObserver', FakeObserver);
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
    vi.unstubAllGlobals();
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

  it('draws skeleton columns while loading', () => {
    render({ columns: undefined });

    expect(el.querySelector('.columns.skeleton')).not.toBeNull();
    expect(el.querySelectorAll('.skeleton-card')).toHaveLength(6);
  });

  it('pages a column when its end comes into view, and retries it', () => {
    render();
    const sentinel = section('doing').querySelector('[data-more]')!;
    expect(FakeObserver.last?.watched.has(sentinel)).toBe(true);

    FakeObserver.last?.report(sentinel);
    expect(loadMore).toEqual(['doing']);

    render({ failed: new Set(['doing']) });
    expect(section('doing').querySelector('[data-more]')).toBeNull();
    section('doing')
      .querySelector<HTMLElement>('.more-error ion-button')!
      .click();
    expect(loadMore).toEqual(['doing', 'doing']);
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

      expect(dropped).toEqual([{ task: TASK, status: STATUSES[2] }]);
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
