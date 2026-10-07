import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { AuthService } from '../../auth/auth.service';
import { FLUX_API } from '../../providers/flux-api.token';
import { TaskDetailPage, type TaskPreview } from './task-detail.page';

const clipboard = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: clipboard }));

describe('TaskDetailPage', () => {
  let fixture: ComponentFixture<TaskDetailPage>;
  let api: InMemoryFluxApi;
  let toast: { create: ReturnType<typeof vi.fn> };

  async function create(
    options: { taskId?: string; row?: TaskPreview; api?: InMemoryFluxApi } = {}
  ) {
    TestBed.resetTestingModule();
    api = options.api ?? new InMemoryFluxApi();
    toast = {
      create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
    };
    await TestBed.configureTestingModule({
      imports: [TaskDetailPage],
      providers: [
        provideRouter([]),
        { provide: FLUX_API, useValue: api },
        { provide: ToastController, useValue: toast },
        { provide: AuthService, useValue: { account: signal({ id: 'a1' }) } },
      ],
    }).compileComponents();
    if (options.row) {
      vi.spyOn(TestBed.inject(Router), 'currentNavigation').mockReturnValue({
        extras: { state: { task: options.row } },
      } as never);
    }

    fixture = TestBed.createComponent(TaskDetailPage);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.componentRef.setInput('taskId', options.taskId ?? '1');
    fixture.componentRef.setInput('backHref', '/tabs/projects');
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (selector: string) =>
    element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const tab = (name: string) =>
    Array.from(
      element().querySelectorAll<HTMLButtonElement>('[role=tab]')
    ).find((b) => b.textContent?.trim().startsWith(name))!;

  it('shows the header: key, title and chips', async () => {
    await create();
    await settle();

    expect(text('.key')).toBe('CHK-142');
    expect(text('.title')).toBe('Fix 3DS redirect on Safari');
    expect(text('.status')).toBe('In Progress');
    expect(text('.chip.priority')).toBe('Critical');
    expect(text('.chip:not(.priority)')).toBe('Bug');
  });

  it('fills the header from the list row while the task loads', async () => {
    const slow = new InMemoryFluxApi();
    vi.spyOn(slow, 'getTask').mockReturnValue(new Promise(() => undefined));
    await create({
      api: slow,
      row: {
        id: '1',
        taskKey: 'CHK-142',
        title: 'From the row',
        status: 'in_progress',
        statusName: 'In Progress',
        statusCategory: 'IN_PROGRESS',
        priority: 'CRITICAL',
        type: 'BUG',
      },
    });

    expect(text('.title')).toBe('From the row');
    expect(text('.key')).toBe('CHK-142');
    expect(text('.status')).toBe('In Progress');
    expect(element().querySelector('app-task-details-skeleton')).not.toBeNull();
  });

  it('ignores a row passed for another task', async () => {
    await create({
      taskId: '2',
      row: { id: '1', title: 'Not this one' },
    });
    expect(element().querySelector('.title')).toBeNull();
    expect(element().querySelector('.title-skeleton')).not.toBeNull();
    await settle();
    expect(text('.title')).toBe('Review pull request #482');
  });

  it('shows the Details tab', async () => {
    await create();
    await settle();
    expect(element().querySelector('app-task-details')).not.toBeNull();
    expect(text('.description strong')).toBe('expired sessions');
  });

  it('shows an error with Retry when the task fails to load', async () => {
    await create({ taskId: 'nope' });
    await settle();
    expect(text('app-error-state p')).toBe(
      'Something went wrong loading this task.'
    );
    // Nothing is loading any more, so no skeleton shimmers in the header.
    expect(element().querySelector('.title-skeleton')).toBeNull();
    expect(element().querySelector('.key-skeleton')).toBeNull();

    const spy = vi.spyOn(api, 'getTask');
    (
      element().querySelector('app-error-state ion-button') as HTMLElement
    ).click();
    await settle();
    expect(spy).toHaveBeenCalledWith('p1', 'nope');
  });

  it('counts comments, replies included, on the tab', async () => {
    await create();
    await settle();
    expect(text('[role=tab] .count')).toBe('3');
  });

  it('shows the comment thread, or No comments yet', async () => {
    await create();
    await settle();
    tab('Comments').click();
    fixture.detectChanges();
    expect(
      element().querySelectorAll('app-task-comments .author')
    ).toHaveLength(3);

    await create({ taskId: '2' });
    await settle();
    tab('Comments').click();
    fixture.detectChanges();
    expect(text('app-empty-state p')).toBe('No comments yet');
    expect(element().querySelector('[role=tab] .count')).toBeNull();
  });

  it('loads activity the first time its tab opens', async () => {
    await create();
    await settle();
    const spy = vi.spyOn(api, 'listTaskActivities');
    expect(spy).not.toHaveBeenCalled();

    tab('Activity').click();
    await settle();
    expect(spy).toHaveBeenCalledWith('p1', '1', { page: 0, size: 50 });
    expect(element().querySelectorAll('app-task-activity .entry')).toHaveLength(
      5
    );
    expect(tab('Activity').getAttribute('aria-selected')).toBe('true');
  });

  it('subscribes and unsubscribes with the bell', async () => {
    await create();
    await settle();
    // Ionic moves aria-pressed onto its inner button, so read the class.
    const bell = () => element().querySelector<HTMLElement>('.bell')!;
    expect(bell().classList).not.toContain('watching');

    bell().click();
    await settle();
    expect(bell().classList).toContain('watching');
    expect(await api.getTaskSubscription('p1', '1')).toEqual({
      subscribed: true,
    });

    bell().click();
    await settle();
    expect(bell().classList).not.toContain('watching');
    expect(await api.getTaskSubscription('p1', '1')).toEqual({
      subscribed: false,
    });
  });

  it('puts the bell back and says why when the server refuses', async () => {
    await create();
    await settle();
    vi.spyOn(api, 'subscribeToTask').mockRejectedValue(
      new ApiError(403, { message: 'Not allowed' })
    );

    const bell = element().querySelector<HTMLElement>('.bell')!;
    bell.click();
    fixture.detectChanges();
    expect(bell.classList).toContain('watching');
    await settle();

    expect(bell.classList).not.toContain('watching');
    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Not allowed' })
    );
  });

  it('copies the key', async () => {
    await create();
    await settle();
    clipboard.write.mockResolvedValue(undefined);

    element().querySelector<HTMLElement>('.copy')!.click();
    await settle();

    expect(clipboard.write).toHaveBeenCalledWith({ string: 'CHK-142' });
    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Copied CHK-142' })
    );
  });

  it('keeps the overflow button disabled for now', async () => {
    await create();
    await settle();
    expect(
      element().querySelector<HTMLIonButtonElement>('.more')?.disabled
    ).toBe(true);
  });

  describe('status changes', () => {
    /** An API where the caller has `role` in p1. */
    function withRole(role: 'COMMENTER' | 'EDITOR' | 'VIEWER') {
      const withRoleApi = new InMemoryFluxApi();
      vi.spyOn(withRoleApi, 'listMyProjects').mockResolvedValue({
        content: [{ project: { id: 'p1', name: 'Checkout' }, role }],
      });
      return withRoleApi;
    }

    const move = () => element().querySelector<HTMLElement>('ion-footer .move');
    const pill = () => text('.status');
    const loaded = () =>
      (
        fixture.componentInstance as unknown as {
          loadedTask(): { status?: string; assignees?: unknown[] };
        }
      ).loadedTask();
    /** The options of the last toast offering Undo. */
    const undoToast = () =>
      toast.create.mock.calls
        .map(([options]) => options)
        .filter((o) => o.buttons?.[0]?.text === 'Undo')
        .at(-1);

    it('docks the comment button and Move to the next status', async () => {
      await create({ taskId: '2' });
      await settle();

      expect(element().querySelector('ion-footer .comment')).not.toBeNull();
      expect(move()?.textContent?.trim()).toBe('Move to In Progress');
      expect(element().querySelector('button.status')).not.toBeNull();
    });

    it('gives a COMMENTER only the comment button, and a VIEWER no bar', async () => {
      await create({ taskId: '2', api: withRole('COMMENTER') });
      await settle();
      expect(element().querySelector('ion-footer .comment')).not.toBeNull();
      expect(move()).toBeNull();
      expect(element().querySelector('button.status')).toBeNull();
      expect(pill()).toBe('To Do');

      await create({ taskId: '2', api: withRole('VIEWER') });
      await settle();
      expect(element().querySelector('ion-footer')).toBeNull();
    });

    it('opens the Comments tab from the comment button', async () => {
      await create({ taskId: '2' });
      await settle();

      element().querySelector<HTMLElement>('ion-footer .comment')!.click();
      fixture.detectChanges();

      expect(tab('Comments').getAttribute('aria-selected')).toBe('true');
    });

    it('moves at once, then fetches the task again instead of using the response', async () => {
      await create({ taskId: '2' });
      await settle();
      const getTask = vi.spyOn(api, 'getTask');

      move()!.click();
      fixture.detectChanges();
      expect(pill()).toBe('In Progress');
      await settle();

      expect((await api.getTask('p1', '2')).status).toBe('in_progress');
      expect(getTask).toHaveBeenCalledWith('p1', '2');
      // The response has no assignees; the fetched task does.
      expect(loaded()?.assignees).toHaveLength(1);
      expect(undoToast()).toMatchObject({
        message: 'Moved to In Progress',
        duration: 4000,
        position: 'bottom',
      });
      expect(move()?.textContent?.trim()).toBe('Move to Done');
    });

    it('undoes a move from the toast', async () => {
      await create({ taskId: '2' });
      await settle();
      move()!.click();
      await settle();

      undoToast().buttons[0].handler();
      await settle();

      expect((await api.getTask('p1', '2')).status).toBe('todo');
      expect(pill()).toBe('To Do');
      expect(undoToast().message).toBe('Moved to In Progress');
    });

    it('puts the status back and shows the server’s message when refused', async () => {
      await create({ taskId: '2' });
      await settle();
      vi.spyOn(api, 'changeTaskStatus').mockRejectedValue(
        new ApiError(400, { message: 'Not in this workflow' })
      );

      move()!.click();
      fixture.detectChanges();
      expect(pill()).toBe('In Progress');
      await settle();

      expect(pill()).toBe('To Do');
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Not in this workflow' })
      );
      expect(undoToast()).toBeUndefined();
    });

    it('opens the sheet with the resolutions when the next status is closed', async () => {
      await create();
      await settle();
      const page = fixture.componentInstance as unknown as {
        sheetOpen(): boolean;
        sheetExpand(): string | undefined;
      };

      expect(move()?.textContent?.trim()).toBe('Move to Done');
      move()!.click();

      expect(page.sheetOpen()).toBe(true);
      expect(page.sheetExpand()).toBe('done');
    });

    it('opens the sheet from the status pill', async () => {
      await create({ taskId: '2' });
      await settle();
      const page = fixture.componentInstance as unknown as {
        sheetOpen(): boolean;
        sheetExpand(): string | undefined;
      };

      element().querySelector<HTMLElement>('button.status')!.click();

      expect(page.sheetOpen()).toBe(true);
      expect(page.sheetExpand()).toBeUndefined();
    });

    it('moves to a closed status with the resolution chosen in the sheet', async () => {
      await create({ taskId: '2' });
      await settle();
      const statuses = await api.listWorkflowStatuses('p1');

      await fixture.componentInstance['move']({
        status: statuses[3],
        resolution: 'wont-do',
      });
      await settle();

      expect(await api.getTask('p1', '2')).toMatchObject({
        status: 'done',
        resolution: 'wont-do',
      });
      expect(pill()).toBe('Done');
    });

    it('offers Change status when there is no next status', async () => {
      await create({ taskId: '6' });
      await settle();

      expect(move()?.textContent?.trim()).toBe('Change status');
    });
  });

  it('fetches subtasks for a container only', async () => {
    await create({ taskId: '6' });
    await settle();
    expect(element().querySelectorAll('.subtask')).toHaveLength(2);

    await create();
    const spy = vi.spyOn(api, 'listChildTasks');
    await settle();
    expect(spy).not.toHaveBeenCalled();
    expect(element().querySelector('.subtasks')).toBeNull();
  });

  it('reloads everything on pull-to-refresh', async () => {
    await create();
    await settle();
    const task = vi.spyOn(api, 'getTask');
    const comments = vi.spyOn(api, 'listTaskComments');
    const complete = vi.fn().mockResolvedValue(undefined);

    fixture.componentInstance['refresh']({
      target: { complete },
    } as never);
    await settle();

    expect(task).toHaveBeenCalled();
    expect(comments).toHaveBeenCalled();
    expect(complete).toHaveBeenCalled();
  });
});
