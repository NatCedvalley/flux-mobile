import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Task, WorkflowStatus } from '@core/api';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { workflowOrder } from '@core/task-status';
import { FLUX_API } from '../../providers/flux-api.token';
import {
  type StatusChoice,
  StatusSheetComponent,
} from './status-sheet.component';

const CATEGORY_POSITIONS = { PLANNING: 0, TODO: 1, IN_PROGRESS: 2, DONE: 3 };

describe('StatusSheetComponent', () => {
  let fixture: ComponentFixture<StatusSheetComponent>;
  let api: InMemoryFluxApi;
  let statuses: WorkflowStatus[];

  async function create(task: Task, expand?: string) {
    api = new InMemoryFluxApi();
    statuses = workflowOrder(
      await api.listWorkflowStatuses('p1'),
      CATEGORY_POSITIONS
    );
    TestBed.configureTestingModule({
      imports: [StatusSheetComponent],
      providers: [{ provide: FLUX_API, useValue: api }],
    });
    fixture = TestBed.createComponent(StatusSheetComponent);
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('statuses', statuses);
    fixture.componentRef.setInput('projectName', 'Checkout');
    fixture.componentRef.setInput('expand', expand);
    await settle();
  }

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function row(name: string): HTMLElement {
    return Array.from(
      element().querySelectorAll<HTMLElement>('ion-item:not(.resolution)')
    ).find(
      (item) => item.querySelector('.name')?.textContent?.trim() === name
    )!;
  }

  function choices(): StatusChoice[] {
    const emitted: StatusChoice[] = [];
    fixture.componentInstance.moved.subscribe((c) => emitted.push(c));
    return emitted;
  }

  const bug: Task = {
    id: '2',
    projectId: 'p1',
    taskKey: 'CHK-150',
    type: 'BUG',
    status: 'todo',
  };

  it('lists the statuses by category under the task’s key and workflow', async () => {
    await create(bug);

    expect(element().querySelector('h1')?.textContent).toBe('Move task');
    expect(element().querySelector('.subtitle')?.textContent).toBe(
      'CHK-150 · Checkout workflow'
    );
    expect(
      Array.from(element().querySelectorAll('h2')).map((h) => h.textContent)
    ).toEqual(['Planning', 'To do', 'In progress', 'Done']);
  });

  it('marks the current status and the suggested next one', async () => {
    await create(bug);

    expect(row('To Do').classList).toContain('current');
    expect(row('To Do').querySelector('.current-note')?.textContent).toBe(
      'current'
    );
    expect(row('In Progress').querySelector('.suggested')?.textContent).toBe(
      'Suggested next'
    );
  });

  it('shows statuses the type can’t use disabled, with the reason', async () => {
    await create(bug);
    const emitted = choices();

    const backlog = row('Backlog');
    expect(backlog.classList).toContain('blocked');
    expect((backlog as HTMLIonItemElement).disabled).toBe(true);
    expect(backlog.querySelector('.hint')?.textContent?.trim()).toBe(
      'Epics and masters only'
    );
    backlog.click();
    expect(emitted).toEqual([]);
  });

  it('moves to an open status on a tap', async () => {
    await create(bug);
    const emitted = choices();

    row('In Progress').click();

    expect(emitted).toEqual([{ status: statuses[2] }]);
  });

  it('closes on a tap of the current status', async () => {
    await create(bug);
    const done = vi.fn();
    fixture.componentInstance.done.subscribe(done);

    row('To Do').click();

    expect(done).toHaveBeenCalled();
  });

  it('asks for a resolution before moving to a closed status', async () => {
    await create(bug);
    const emitted = choices();

    const closed = row('Done');
    expect(closed.querySelector('.hint')?.textContent?.trim()).toBe(
      'Resolution required'
    );
    closed.click();
    await settle();

    expect(emitted).toEqual([]);
    expect(closed.getAttribute('aria-expanded')).toBe('true');
    const resolutions = element().querySelectorAll<HTMLElement>(
      'ion-item.resolution'
    );
    expect(Array.from(resolutions).map((r) => r.textContent?.trim())).toEqual([
      'Done',
      'Won’t do',
      'Duplicate',
    ]);

    resolutions[1].click();
    expect(emitted).toEqual([{ status: statuses[3], resolution: 'wont-do' }]);
  });

  it('opens with a closed status’s resolutions showing when asked to', async () => {
    await create({ ...bug, status: 'in_progress' }, 'done');

    expect(element().querySelectorAll('ion-item.resolution')).toHaveLength(3);
  });

  it('offers Retry when the resolutions don’t load', async () => {
    api = new InMemoryFluxApi();
    vi.spyOn(
      InMemoryFluxApi.prototype,
      'listResolutions'
    ).mockRejectedValueOnce(new Error('offline'));
    await create(bug, 'done');

    expect(
      element().querySelector('.resolutions .note ion-button')
    ).not.toBeNull();
  });

  it('cancels', async () => {
    await create(bug);
    const done = vi.fn();
    fixture.componentInstance.done.subscribe(done);

    element().querySelector<HTMLElement>('.cancel')!.click();

    expect(done).toHaveBeenCalled();
  });
});
