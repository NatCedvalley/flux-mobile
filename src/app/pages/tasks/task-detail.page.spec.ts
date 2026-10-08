import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import {
  AlertController,
  IonContent,
  NavController,
  ToastController,
} from '@ionic/angular';
import type { MyProject, Task, TaskComment } from '@core/api';
import type { TaskChange } from '@core/task-edit';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import type { CommentSheetChoice } from './comment-sheet/comment-sheet.component';
import type { OverflowAction } from './task-overflow-sheet/task-overflow-sheet.component';
import { AuthService } from '../../auth/auth.service';
import { FLUX_API } from '../../providers/flux-api.token';
import { TaskChangesService } from '../../task-status/task-changes.service';
import { CommentComposerComponent } from './comment-composer/comment-composer.component';
import { TaskDetailPage, type TaskPreview } from './task-detail.page';

const clipboard = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: clipboard }));

describe('TaskDetailPage', () => {
  let fixture: ComponentFixture<TaskDetailPage>;
  let api: InMemoryFluxApi;
  let toast: { create: ReturnType<typeof vi.fn> };
  let alert: { create: ReturnType<typeof vi.fn>; role: string };
  let nav: {
    pop: ReturnType<typeof vi.fn>;
    navigateBack: ReturnType<typeof vi.fn>;
  };

  async function create(
    options: { taskId?: string; row?: TaskPreview; api?: InMemoryFluxApi } = {}
  ) {
    TestBed.resetTestingModule();
    api = options.api ?? new InMemoryFluxApi();
    toast = {
      create: vi.fn().mockResolvedValue({ present: vi.fn(), dismiss: vi.fn() }),
    };
    alert = {
      role: 'destructive',
      create: vi.fn().mockImplementation(() =>
        Promise.resolve({
          present: vi.fn(),
          onDidDismiss: () => Promise.resolve({ role: alert.role }),
        })
      ),
    };
    nav = { pop: vi.fn().mockResolvedValue(true), navigateBack: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [TaskDetailPage],
      providers: [
        provideRouter([]),
        { provide: FLUX_API, useValue: api },
        { provide: ToastController, useValue: toast },
        { provide: AlertController, useValue: alert },
        { provide: NavController, useValue: nav },
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

  /** An API where the caller has `role` in p1. */
  function withRole(role: NonNullable<MyProject['role']>) {
    const withRoleApi = new InMemoryFluxApi();
    vi.spyOn(withRoleApi, 'listMyProjects').mockResolvedValue({
      content: [{ project: { id: 'p1', name: 'Checkout' }, role }],
    });
    return withRoleApi;
  }

  /** The page's protected members the editing tests drive. */
  type Page = {
    loadedTask(): Task | undefined;
    canEdit(): boolean;
    canReassign(): boolean;
    canArchive(): boolean;
    canDelete(): boolean;
    editor(): string | undefined;
    openEditor(editor: string): void;
    editorClosed(editor: string): void;
    save(change: TaskChange): void;
    pickPriority(priority: string): void;
    pickType(type: string): void;
    pickParent(id: string): void;
    parentItems(): { id: string; label: string }[] | undefined;
    labelDraft: { set(names: string[]): void };
    assigneeDraft: { (): readonly string[]; set(ids: string[]): void };
    chooseOverflow(action: OverflowAction): void;
    overflowClosed(): void;
  };
  const page = () => fixture.componentInstance as unknown as Page;
  /** The message of the last toast. */
  const lastToast = () => toast.create.mock.calls.at(-1)?.[0].message;

  describe('editing', () => {
    it('lets an EDITOR edit the title, priority and type from the header', async () => {
      await create();
      await settle();
      expect(element().querySelector('button.edit-title')).not.toBeNull();
      expect(element().querySelector('button.chip.priority')).not.toBeNull();
      expect(element().querySelector('button.chip.type')).not.toBeNull();

      await create({ api: withRole('VIEWER') });
      await settle();
      expect(element().querySelector('button.edit-title')).toBeNull();
      expect(element().querySelector('button.chip')).toBeNull();
      expect(element().querySelector('.edit-due')).toBeNull();
    });

    it('saves a title at once, keeping every field it doesn’t show', async () => {
      await create();
      await settle();
      const before = await api.getTask('p1', '1');

      page().save({ title: 'Safari drops the 3DS return URL' });
      fixture.detectChanges();
      expect(text('.title')).toBe('Safari drops the 3DS return URL');
      await settle();

      const after = await api.getTask('p1', '1');
      expect(after.title).toBe('Safari drops the 3DS return URL');
      for (const field of [
        'dueDate',
        'labels',
        'environment',
        'affectedVersion',
        'bugOccurredAt',
        'affectedUser',
        'description',
      ] as const) {
        expect(after[field], field).toEqual(before[field]);
      }
      // The response has no assignees; the task was fetched again.
      expect(page().loadedTask()?.assignees).toHaveLength(1);
    });

    it('changes the priority, and clears the due date', async () => {
      await create();
      await settle();

      page().pickPriority('LOW');
      await settle();
      page().save({ dueDate: undefined });
      await settle();

      const task = await api.getTask('p1', '1');
      expect(task.priority).toBe('LOW');
      expect(task.dueDate).toBeUndefined();
      expect(task.labels).toEqual(['safari', 'payments', '3ds']);
      expect(text('.edit-due .value')).toBe('No due date');
    });

    it('reports an edit, so the list further back shows it', async () => {
      await create();
      await settle();
      page().pickPriority('LOW');
      await settle();
      expect(TestBed.inject(TaskChangesService).changed()?.task.priority).toBe(
        'LOW'
      );
    });

    it('puts a refused type change back and shows the server’s message', async () => {
      await create({ taskId: '6' });
      await settle();

      page().pickType('TASK');
      await settle();

      expect(lastToast()).toBe(
        'A task with subtasks must stay a master or an epic'
      );
      expect(text('.chip.type')).toBe('Epic');
    });

    it('saves a description as Markdown', async () => {
      await create({ taskId: '2' });
      await settle();
      page().save({
        description: 'Check **both** browsers',
        descriptionFormat: 'MARKDOWN',
      });
      await settle();
      expect(await api.getTask('p1', '2')).toMatchObject({
        description: 'Check **both** browsers',
        descriptionFormat: 'MARKDOWN',
      });
    });

    it('adds and removes labels through the label endpoints when the picker closes', async () => {
      await create();
      await settle();
      const update = vi.spyOn(api, 'updateTask');
      const add = vi.spyOn(api, 'addTaskLabel');
      const remove = vi.spyOn(api, 'removeTaskLabel');

      page().openEditor('labels');
      await settle();
      page().labelDraft.set(['payments', '3ds', 'ios']);
      page().editorClosed('labels');
      await settle();

      expect(add).toHaveBeenCalledWith('p1', 'l4', '1');
      expect(remove).toHaveBeenCalledWith('p1', 'l1', '1');
      expect(update).not.toHaveBeenCalled();
      expect((await api.getTask('p1', '1')).labels).toEqual([
        'payments',
        '3ds',
        'ios',
      ]);
    });

    it('sends nothing when the labels didn’t change', async () => {
      await create();
      await settle();
      const add = vi.spyOn(api, 'addTaskLabel');
      page().openEditor('labels');
      await settle();
      page().editorClosed('labels');
      await settle();
      expect(add).not.toHaveBeenCalled();
    });

    it('moves a task under an epic from the parent picker', async () => {
      await create({ taskId: '2' });
      await settle();
      page().openEditor('parent');
      await settle();
      expect(
        page()
          .parentItems()
          ?.map((i) => i.label)
      ).toEqual(['Migrate saved cards']);

      page().pickParent('6');
      await settle();
      expect((await api.getTask('p1', '2')).parentTaskId).toBe('6');
      expect(text('.parent .key')).toBe('CHK-120');
    });

    it('moves a task to the root from the parent picker', async () => {
      await create();
      await settle();
      page().openEditor('parent');
      await settle();
      expect(page().parentItems()?.[0]).toMatchObject({
        id: '',
        label: 'No parent',
      });

      page().pickParent('');
      await settle();
      expect((await api.getTask('p1', '1')).parentTaskId).toBeUndefined();
      expect(text('.parent')).toBeUndefined();
    });

    it('shows the server’s message when the parent is refused', async () => {
      await create({ taskId: '2' });
      await settle();
      vi.spyOn(api, 'changeTaskParent').mockRejectedValue(
        new ApiError(400, {
          code: 'MAX_HIERARCHY_DEPTH_EXCEEDED',
          message: 'Too deep',
        })
      );
      page().openEditor('parent');
      await settle();
      page().pickParent('6');
      await settle();
      expect(lastToast()).toBe('Too deep');
      expect(page().loadedTask()?.parentTaskId).toBeUndefined();
    });

    it('reassigns with every chosen person, keeping co-assignees', async () => {
      await create({ api: withRole('LEAD') });
      await settle();

      page().openEditor('assignees');
      await settle();
      expect(page().assigneeDraft()).toEqual(['a1']);
      page().assigneeDraft.set(['a1', 'a2']);
      page().editorClosed('assignees');
      await settle();

      expect(
        (await api.getTask('p1', '1')).assignees?.map((a) => a.firstName)
      ).toEqual(['Ada', 'Ben']);
    });

    it('offers no edits on an archived task', async () => {
      const archived = new InMemoryFluxApi();
      await archived.changeTaskStatus('p1', '2', {
        status: 'done',
        resolution: 'done',
      });
      await archived.archiveTask('p1', '2');
      await create({ taskId: '2', api: archived });
      await settle();

      expect(page().canEdit()).toBe(false);
      expect(page().canArchive()).toBe(false);
      expect(element().querySelector('button.edit-title')).toBeNull();
      expect(element().querySelector('button.status')).toBeNull();
    });
  });

  describe('overflow sheet', () => {
    const run = async (action: OverflowAction) => {
      page().chooseOverflow(action);
      page().overflowClosed();
      await settle();
    };

    it('opens once the task has loaded', async () => {
      await create();
      expect(
        element().querySelector<HTMLIonButtonElement>('.more')?.disabled
      ).toBe(true);
      await settle();
      expect(
        element().querySelector<HTMLIonButtonElement>('.more')?.disabled
      ).toBe(false);
    });

    it('offers each action only to the roles that may use it', async () => {
      const flags = () => ({
        edit: page().canEdit(),
        reassign: page().canReassign(),
        delete: page().canDelete(),
      });

      await create({ api: withRole('VIEWER') });
      await settle();
      expect(flags()).toEqual({ edit: false, reassign: false, delete: false });

      await create({ api: withRole('EDITOR') });
      await settle();
      expect(flags()).toEqual({ edit: true, reassign: false, delete: false });

      await create({ api: withRole('LEAD') });
      await settle();
      expect(flags()).toEqual({ edit: true, reassign: true, delete: true });
    });

    it('offers Archive for a done task only', async () => {
      await create({ taskId: '2' });
      await settle();
      expect(page().canArchive()).toBe(false);

      await create({ taskId: '6' });
      await settle();
      expect(page().canArchive()).toBe(true);
    });

    it('opens the parent picker and Reassign once the sheet has closed', async () => {
      await create({ api: withRole('LEAD') });
      await settle();

      page().chooseOverflow('parent');
      expect(page().editor()).toBeUndefined();
      page().overflowClosed();
      expect(page().editor()).toBe('parent');

      await run('reassign');
      expect(page().editor()).toBe('assignees');
    });

    it('copies the task’s web link', async () => {
      await create();
      await settle();
      await run('link');
      expect(clipboard.write).toHaveBeenCalledWith({
        string: 'http://localhost:4200/projects/p1/tasks/1',
      });
      expect(lastToast()).toBe('Copied link');
    });

    it('archives a done task with Undo, and the list drops its row', async () => {
      const done = new InMemoryFluxApi();
      for (const id of ['1', '4']) {
        await done.changeTaskStatus('p1', id, {
          status: 'done',
          resolution: 'done',
        });
      }
      await create({ taskId: '6', api: done });
      await settle();
      await run('archive');

      expect((await api.getTask('p1', '6')).isArchived).toBe(true);
      expect(TestBed.inject(TaskChangesService).changed()?.task).toMatchObject({
        id: '6',
        isArchived: true,
      });
      expect(page().canEdit()).toBe(false);

      const undo = toast.create.mock.calls
        .map(([options]) => options)
        .find((o) => o.buttons?.[0]?.text === 'Undo');
      expect(undo.message).toBe('Archived CHK-120');
      undo.buttons[0].handler();
      await settle();
      expect((await api.getTask('p1', '6')).isArchived).toBe(false);
      expect(page().canEdit()).toBe(true);
    });

    it('deletes after an alert naming the key, then goes back', async () => {
      await create({ api: withRole('LEAD') });
      await settle();
      await run('delete');

      expect(alert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          header: 'Delete task?',
          message:
            'This will permanently delete CHK-142. This action cannot be undone.',
        })
      );
      await expect(api.getTask('p1', '1')).rejects.toThrow();
      expect(TestBed.inject(TaskChangesService).changed()).toMatchObject({
        task: { id: '1' },
        removed: true,
      });
      expect(lastToast()).toBe('Deleted CHK-142');
      expect(nav.pop).toHaveBeenCalled();
    });

    it('goes to the tab’s root after deleting a deep-linked task', async () => {
      await create({ api: withRole('LEAD') });
      await settle();
      nav.pop.mockResolvedValue(false);
      await run('delete');
      await vi.waitFor(() =>
        expect(nav.navigateBack).toHaveBeenCalledWith('/tabs/projects')
      );
    });

    it('keeps the task when the alert is cancelled', async () => {
      await create({ api: withRole('LEAD') });
      await settle();
      alert.role = 'cancel';
      await run('delete');
      await expect(api.getTask('p1', '1')).resolves.toBeDefined();
      expect(nav.pop).not.toHaveBeenCalled();
    });
  });

  describe('status changes', () => {
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

    it('opens the Comments tab from the comment button, ready to type', async () => {
      const focus = vi.spyOn(CommentComposerComponent.prototype, 'focus');
      await create({ taskId: '2' });
      await settle();

      element().querySelector<HTMLElement>('ion-footer .comment')!.click();
      await settle();

      expect(tab('Comments').getAttribute('aria-selected')).toBe('true');
      expect(element().querySelector('app-task-action-bar')).toBeNull();
      expect(element().querySelector('app-comment-composer')).not.toBeNull();
      expect(focus).toHaveBeenCalled();
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

  describe('comment writing', () => {
    /** The page's protected members the comment tests drive. */
    type CommentPage = {
      editor(): string | undefined;
      editorClosed(editor: string): void;
      openMentions(): void;
      pickMention(id: string): void;
      mentionItems(): { id: string; label: string }[] | undefined;
      openCommentSheet(mode: 'actions' | 'react', comment: TaskComment): void;
      chooseInCommentSheet(choice: CommentSheetChoice): void;
      commentSheetClosed(): void;
      saveComment(body: string): Promise<void>;
    };
    const commentPage = () =>
      fixture.componentInstance as unknown as CommentPage;
    const thread = async () =>
      (await api.listTaskComments('p1', '1')).content ?? [];
    const texts = (selector: string) =>
      Array.from(element().querySelectorAll(selector)).map((e) =>
        e.textContent?.replace(/\s+/g, ' ').trim()
      );

    async function openComments(options: { api?: InMemoryFluxApi } = {}) {
      await create(options);
      await settle();
      tab('Comments').click();
      await settle();
    }

    /** Runs the comment sheet's `choice` on `comment`, as a tap would. */
    function choose(comment: TaskComment, choice: CommentSheetChoice) {
      commentPage().openCommentSheet(
        choice.kind === 'react' ? 'react' : 'actions',
        comment
      );
      commentPage().chooseInCommentSheet(choice);
      commentPage().commentSheetClosed();
    }

    beforeEach(() => {
      // Ionic's elements aren't hydrated in tests.
      vi.spyOn(IonContent.prototype, 'scrollToBottom').mockResolvedValue();
    });

    it('docks the composer on Comments for a COMMENTER, and nothing for a VIEWER', async () => {
      await openComments({ api: withRole('COMMENTER') });
      expect(element().querySelector('app-comment-composer')).not.toBeNull();
      expect(element().querySelector('app-task-action-bar')).toBeNull();

      await openComments({ api: withRole('VIEWER') });
      expect(element().querySelector('ion-footer')).toBeNull();
      // A VIEWER still reacts, but edits nothing.
      expect(element().querySelector('.add-reaction')).not.toBeNull();
      expect(element().querySelector('app-task-comments .more')).toBeNull();
    });

    it('posts a comment to the end of the thread', async () => {
      await openComments();
      const field = element().querySelector(
        'app-comment-composer ion-textarea'
      )!;
      field.dispatchEvent(
        new CustomEvent('ionInput', { detail: { value: ' Shipped ' } })
      );
      await settle();
      element()
        .querySelector<HTMLElement>('app-comment-composer .send')!
        .click();
      await settle();

      expect((await thread()).at(-1)?.body).toBe('Shipped');
      expect(texts('.thread > li > .comment .bubble').at(-1)).toBe('Shipped');
      expect(text('[role=tab] .count')).toBe('4');
      expect(IonContent.prototype.scrollToBottom).toHaveBeenCalled();
      expect(
        element().querySelector<HTMLIonButtonElement>(
          'app-comment-composer .send'
        )?.disabled
      ).toBe(true);
    });

    it('keeps the text when the post is refused', async () => {
      await openComments();
      vi.spyOn(api, 'addTaskComment').mockRejectedValue(
        new ApiError(403, { message: 'Insufficient project role' })
      );
      const field = element().querySelector(
        'app-comment-composer ion-textarea'
      )!;
      field.dispatchEvent(
        new CustomEvent('ionInput', { detail: { value: 'Hi' } })
      );
      await settle();
      element()
        .querySelector<HTMLElement>('app-comment-composer .send')!
        .click();
      await settle();

      expect(lastToast()).toBe('Insufficient project role');
      expect(text('[role=tab] .count')).toBe('3');
      expect(
        element().querySelector<HTMLIonButtonElement>(
          'app-comment-composer .send'
        )?.disabled
      ).toBe(false);
    });

    it('mentions a member from the picker, leaving out the caller', async () => {
      const insert = vi
        .spyOn(CommentComposerComponent.prototype, 'insertMention')
        .mockResolvedValue();
      await openComments();

      commentPage().openMentions();
      await settle();
      expect(commentPage().editor()).toBe('mention');
      expect(
        commentPage()
          .mentionItems()
          ?.map((i) => i.label)
      ).toEqual(['Ben Tan', 'Chen Wei']);

      commentPage().pickMention('a2');
      expect(insert).not.toHaveBeenCalled();
      commentPage().editorClosed('mention');
      expect(insert).toHaveBeenCalledWith({ id: 'a2', name: 'Ben Tan' });
    });

    it('toggles a reaction, swapping the caller’s own', async () => {
      await openComments();
      element().querySelectorAll<HTMLElement>('.reaction')[1].click();
      await settle();

      expect(texts('.reaction')).toEqual(['👍1', '👀2']);
    });

    it('adds a reaction from the sheet', async () => {
      await openComments();
      const [, c3] = await thread();
      choose(c3, { kind: 'react', emoji: 'rocket' });
      await settle();

      expect(texts('.reaction').at(-1)).toBe('🚀1');
    });

    it('edits the caller’s own comment, keeping its reactions', async () => {
      const reacted = new InMemoryFluxApi();
      await reacted.toggleCommentReaction('p1', '1', 'c2', 'heart');
      await openComments({ api: reacted });
      const [c1] = await thread();

      choose(c1.replies![0], { kind: 'edit' });
      expect(commentPage().editor()).toBe('comment');
      await commentPage().saveComment('Fixed it');
      await settle();

      expect(text('.replies .bubble')).toBe('Fixed it');
      expect(text('.replies .age')).toContain('edited');
      expect(texts('.replies .reaction')).toEqual(['❤️1']);
    });

    it('deletes the caller’s comment once confirmed', async () => {
      await openComments();
      const [c1] = await thread();

      alert.role = 'cancel';
      choose(c1.replies![0], { kind: 'delete' });
      await settle();
      expect(element().querySelector('.replies')).not.toBeNull();

      alert.role = 'destructive';
      choose(c1.replies![0], { kind: 'delete' });
      await settle();
      expect(alert.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ header: 'Delete comment?' })
      );
      expect(element().querySelector('.replies')).toBeNull();
      expect(text('[role=tab] .count')).toBe('2');
      expect(lastToast()).toBe('Comment deleted');
    });

    it('shows the server’s message when the comment has replies', async () => {
      const withReply = new InMemoryFluxApi();
      await withReply.addTaskComment('p1', '1', {
        body: 'A reply',
        parentCommentId: 'c3',
      });
      await openComments({ api: withReply });
      const [, c3] = await thread();

      choose(c3, { kind: 'delete' });
      await settle();

      expect(lastToast()).toBe(
        'This comment has replies. Delete its replies first.'
      );
      expect(texts('.thread > li > .comment .author')).toHaveLength(2);
    });
  });
});
