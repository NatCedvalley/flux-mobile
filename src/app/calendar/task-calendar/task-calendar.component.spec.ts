import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import type { Task } from '@core/api';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { taskUpdateBody } from '@core/task-edit';
import type { Pickup } from '../../board/task-board/board-drag';
import { LONG_PRESS_MS } from '../../board/task-board/board-drag';
import { FLUX_API } from '../../providers/flux-api.token';
import { TaskChangesService } from '../../task-status/task-changes.service';
import { TaskCalendarComponent, UNSCHEDULED } from './task-calendar.component';

// Today is Tue 13 Oct 2026. In project p1, CHK-142 is due 12 Oct (overdue),
// CHK-150 13 Oct, CHK-131 is planned 17–19 Oct (due 18 Oct), CHK-120 is
// due 3 Oct and done, and CHK-160 has no dates.
const TODAY = new Date(2026, 9, 13);

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

describe('TaskCalendarComponent', () => {
  let fixture: ComponentFixture<TaskCalendarComponent>;
  let el: HTMLElement;
  let api: InMemoryFluxApi;
  let toast: { create: ReturnType<typeof vi.fn> };
  let months: string[];
  /** What `elementFromPoint` finds: the day the finger is over. */
  let under: Element | null;

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    for (const [name, value] of Object.entries({
      projectId: 'p1',
      query: {},
      statuses: await api.listWorkflowStatuses('p1'),
      today: '2026-10-13',
      canEdit: true,
      month: '2026-10',
      ...inputs,
    })) {
      fixture.componentRef.setInput(name, value);
    }
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const day = (iso: string) =>
    el.querySelector<HTMLElement>(`.day[data-column="${iso}"]`)!;
  const keys = (iso: string) =>
    Array.from(day(iso).querySelectorAll('.pill')).map((p) => p.textContent);
  const pill = (iso: string, id: string) =>
    day(iso).querySelector<HTMLElement>(`[data-task-id="${id}"]`)!;
  const calendar = () =>
    fixture.componentInstance as unknown as {
      rows(): { items: Task[]; total: number };
      sheetOpen(): boolean;
      sheetTasks(): Task[];
      drop(pickup: Pickup, key: string | undefined): void;
    };

  /** Long-presses a day's pill, drags it over `to` and lets it go there. */
  async function drag(from: string, id: string, to: string): Promise<void> {
    pill(from, id).dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    under = day(to);
    document.dispatchEvent(pointer('pointermove', 100, 20));
    fixture.detectChanges();
    document.dispatchEvent(pointer('pointerup', 100, 20));
    await settle();
  }

  /** The Undo button's handler from the last toast. */
  function undo(): void {
    const options = toast.create.mock.lastCall?.[0] as {
      buttons: { handler: () => void }[];
    };
    options.buttons[0].handler();
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    under = null;
    document.elementFromPoint = vi.fn(() => under);
    api = new InMemoryFluxApi(TODAY);
    toast = {
      create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
    };
    await TestBed.configureTestingModule({
      imports: [TaskCalendarComponent],
      providers: [
        // Task detail's route, which a tap on a pill opens.
        provideRouter([{ path: 'tasks/:p/:t', children: [] }]),
        { provide: FLUX_API, useValue: api },
        { provide: ToastController, useValue: toast },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TaskCalendarComponent);
    el = fixture.nativeElement as HTMLElement;
    months = [];
    fixture.componentInstance.month.subscribe((m) => months.push(m));
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('draws the month from Monday, with today ringed and the other months and weekends marked', async () => {
    await render();

    expect(el.querySelector('.month-title')?.textContent?.trim()).toBe(
      'October 2026'
    );
    const days = Array.from(el.querySelectorAll<HTMLElement>('.day'));
    expect(days).toHaveLength(35);
    expect(days[0].dataset['column']).toBe('2026-09-28');
    expect(days[0].classList).toContain('outside');
    expect(days[5].classList).toContain('weekend');
    expect(day('2026-10-13').classList).toContain('today');
  });

  it('puts each task on its days, a planned range on every one, in its hue or red when overdue', async () => {
    await render();

    expect(keys('2026-10-12')).toEqual(['CHK-142']);
    expect(pill('2026-10-12', '1').classList).toContain('overdue');
    expect(keys('2026-10-13')).toEqual(['CHK-150']);
    expect(pill('2026-10-13', '2').classList).not.toContain('overdue');
    expect(pill('2026-10-13', '2').style.getPropertyValue('--group-dot')).toBe(
      'var(--flux-bluedot)'
    );
    for (const iso of ['2026-10-17', '2026-10-18', '2026-10-19']) {
      expect(keys(iso)).toEqual(['CHK-131']);
    }
    expect(keys('2026-10-03')).toEqual(['CHK-120']);
  });

  it('loads the whole window, and again for another month', async () => {
    const list = vi.spyOn(api, 'listProjectTasks');
    await render();

    expect(list).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        dueDateFrom: '2026-09-28',
        dueDateTo: '2026-11-01',
        page: 0,
        size: 100,
      })
    );
    expect(list).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ onlyUnscheduled: true })
    );

    el.querySelectorAll<HTMLElement>('.month-bar ion-button')[1].click();
    await settle();
    expect(months).toEqual(['2026-11']);
    expect(list).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({
        dueDateFrom: '2026-10-26',
        dueDateTo: '2026-12-06',
      })
    );
    expect(el.querySelectorAll('.day')).toHaveLength(42);

    el.querySelector<HTMLElement>('.today-button')!.click();
    expect(months).toEqual(['2026-11', '2026-10']);
  });

  it('lists the unscheduled tasks in the drawer, with their count', async () => {
    await render();

    expect(
      calendar()
        .rows()
        .items.map((t) => t.taskKey)
    ).toEqual(['CHK-160']);
    expect(calendar().rows().total).toBe(1);
  });

  it('gives a full day one pill and +n more, which opens the day in a sheet', async () => {
    for (const id of ['1', '6']) {
      const task = await api.getTask('p1', id);
      await api.updateTask(
        'p1',
        id,
        taskUpdateBody(task, { dueDate: '2026-10-13' })
      );
    }
    await render();

    expect(day('2026-10-13').querySelectorAll('.pill')).toHaveLength(1);
    const more = day('2026-10-13').querySelector<HTMLElement>('.more')!;
    expect(more.textContent?.trim()).toBe('+2 more');

    more.click();
    fixture.detectChanges();
    expect(calendar().sheetOpen()).toBe(true);
    expect(
      calendar()
        .sheetTasks()
        .map((t) => t.taskKey)
        .sort()
    ).toEqual(['CHK-120', 'CHK-142', 'CHK-150']);
  });

  it('reads each day in full and marks today as the current date', async () => {
    await render();

    const today = day('2026-10-13');
    expect(today.getAttribute('aria-current')).toBe('date');
    expect(today.hasAttribute('aria-label')).toBe(false);
    expect(today.querySelector('.flux-sr-only')?.textContent).toMatch(
      /^Tue 13 Oct, today, \d+ tasks?$/
    );
    expect(day('2026-10-14').getAttribute('aria-current')).toBeNull();
    expect(day('2026-10-14').querySelector('.flux-sr-only')?.textContent).toBe(
      'Wed 14 Oct'
    );
  });

  it('opens a day from the keyboard, but leaves a key on a pill to the pill', async () => {
    await render();

    const pillKey = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    day('2026-10-13').querySelector('.pill')!.dispatchEvent(pillKey);
    expect(calendar().sheetOpen()).toBe(false);

    const space = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    day('2026-10-13').dispatchEvent(space);
    expect(calendar().sheetOpen()).toBe(true);
    expect(space.defaultPrevented).toBe(true);
  });

  it('opens a day in the sheet from a tap on it, but not from an empty day', async () => {
    await render();

    day('2026-10-14').click();
    expect(calendar().sheetOpen()).toBe(false);
    day('2026-10-13').click();
    expect(calendar().sheetOpen()).toBe(true);
  });

  it('moves a dragged task’s due date, keeping every other field, and offers Undo', async () => {
    await render();
    const before = await api.getTask('p1', '1');

    await drag('2026-10-12', '1', '2026-10-20');

    expect(keys('2026-10-12')).toEqual([]);
    expect(keys('2026-10-20')).toEqual(['CHK-142']);
    const saved = await api.getTask('p1', '1');
    expect(saved.dueDate).toBe('2026-10-20');
    expect(saved).toMatchObject({
      labels: before.labels,
      environment: before.environment,
      affectedVersion: before.affectedVersion,
      fixVersion: before.fixVersion,
      bugOccurredAt: before.bugOccurredAt,
      affectedUser: before.affectedUser,
    });
    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Rescheduled CHK-142' })
    );

    undo();
    await vi.waitFor(async () =>
      expect((await api.getTask('p1', '1')).dueDate).toBe('2026-10-12')
    );
    await settle();
    expect(keys('2026-10-12')).toEqual(['CHK-142']);
  });

  it('moves a planned range whole, by the days it was dragged', async () => {
    await render();

    // Picked up by its middle day.
    await drag('2026-10-18', '4', '2026-10-25');

    const saved = await api.getTask('p1', '4');
    expect(saved).toMatchObject({
      plannedStartDate: '2026-10-24',
      plannedEndDate: '2026-10-26',
      dueDate: '2026-10-18',
    });
    for (const iso of ['2026-10-24', '2026-10-25', '2026-10-26']) {
      expect(keys(iso)).toEqual(['CHK-131']);
    }
    expect(keys('2026-10-18')).toEqual([]);
  });

  it('schedules a task dropped from the drawer, which leaves it', async () => {
    await render();

    calendar().drop({ taskId: '8', columnKey: UNSCHEDULED }, '2026-10-21');
    await settle();
    await vi.waitFor(async () =>
      expect((await api.getTask('p1', '8')).dueDate).toBe('2026-10-21')
    );
    await settle();

    expect(keys('2026-10-21')).toEqual(['CHK-160']);
    expect(calendar().rows().items).toEqual([]);
    expect(calendar().rows().total).toBe(0);
  });

  it('ignores a drop on the same day, on the drawer or outside the days', async () => {
    await render();
    const update = vi.spyOn(api, 'updateTask');

    await drag('2026-10-13', '2', '2026-10-13');
    calendar().drop({ taskId: '2', columnKey: '2026-10-13' }, UNSCHEDULED);
    calendar().drop({ taskId: '2', columnKey: '2026-10-13' }, undefined);
    await settle();

    expect(update).not.toHaveBeenCalled();
  });

  it('puts the task back when the server refuses', async () => {
    await render();
    vi.spyOn(api, 'updateTask').mockRejectedValue(new Error('offline'));

    await drag('2026-10-13', '2', '2026-10-15');
    await vi.waitFor(() => expect(toast.create).toHaveBeenCalled());
    await settle();

    expect(keys('2026-10-13')).toEqual(['CHK-150']);
    expect(keys('2026-10-15')).toEqual([]);
  });

  it('doesn’t let a VIEWER pick a task up', async () => {
    await render({ canEdit: false });
    const update = vi.spyOn(api, 'updateTask');

    await drag('2026-10-13', '2', '2026-10-15');

    expect(document.querySelector('.board-ghost')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('follows a change made on task detail', async () => {
    await render();
    const task = await api.getTask('p1', '2');

    TestBed.inject(TaskChangesService).report({
      ...task,
      dueDate: '2026-10-28',
    });
    await settle();
    expect(keys('2026-10-13')).toEqual([]);
    expect(keys('2026-10-28')).toEqual(['CHK-150']);

    TestBed.inject(TaskChangesService).report({ ...task, dueDate: undefined });
    await settle();
    expect(keys('2026-10-28')).toEqual([]);
    expect(
      calendar()
        .rows()
        .items.map((t) => t.taskKey)
    ).toContain('CHK-150');
  });
});
