import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular';
import type { MyProject, Task } from '@core/api';
import type { TaskDraft } from '@core/task-create';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { AuthService } from '../../auth/auth.service';
import { FLUX_API } from '../../providers/flux-api.token';
import { TaskCreateService } from '../task-create.service';
import { CreateTaskSheetComponent } from './create-task-sheet.component';

const PROJECTS: MyProject[] = [
  {
    project: { id: 'p1', projectKey: 'CHK', name: 'Checkout' },
    role: 'EDITOR',
  },
  { project: { id: 'p2', projectKey: 'BIL', name: 'Billing' }, role: 'LEAD' },
];

/** The sheet's protected state and handlers, as its template uses them. */
type Sheet = {
  draft: {
    (): TaskDraft;
    update(fn: (d: TaskDraft) => TaskDraft): void;
  };
  keepOpen: { set(on: boolean): void };
  typeItems(): { id: string }[];
  openPicker(picker: string): void;
  pickProject(id: string): void;
  pickAssignee(id: string): void;
  create(): Promise<void>;
};

describe('CreateTaskSheetComponent', () => {
  let fixture: ComponentFixture<CreateTaskSheetComponent>;
  let api: InMemoryFluxApi;
  let toast: { create: ReturnType<typeof vi.fn> };
  let created: ReturnType<typeof vi.fn>;

  async function create(projectId = 'p1'): Promise<void> {
    api = new InMemoryFluxApi();
    toast = { create: vi.fn().mockResolvedValue({ present: vi.fn() }) };
    created = vi.fn();
    TestBed.configureTestingModule({
      imports: [CreateTaskSheetComponent],
      providers: [
        { provide: FLUX_API, useValue: api },
        { provide: ToastController, useValue: toast },
        { provide: AlertController, useValue: { create: vi.fn() } },
        {
          provide: AuthService,
          useValue: { account: signal({ id: 'a1' }) },
        },
      ],
    });
    fixture = TestBed.createComponent(CreateTaskSheetComponent);
    fixture.componentRef.setInput('projects', PROJECTS);
    fixture.componentRef.setInput('projectId', projectId);
    fixture.componentRef.setInput('created', created);
    await settle();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function sheet(): Sheet {
    return fixture.componentInstance as unknown as Sheet;
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string {
    return (
      element()
        .querySelector(selector)
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? ''
    );
  }

  async function type(title: string): Promise<void> {
    element()
      .querySelector('ion-input.title')!
      .dispatchEvent(new CustomEvent('ionInput', { detail: { value: title } }));
    await settle();
  }

  function createButton(): HTMLIonButtonElement {
    return element().querySelector<HTMLIonButtonElement>('.create')!;
  }

  it('starts in the given project as a task, Create waiting for a title', async () => {
    await create();

    expect(text('.project-name')).toBe('Checkout');
    expect(text('.type-chip')).toBe('Task');
    expect(createButton().disabled).toBe(true);

    await type('  ');
    expect(createButton().disabled).toBe(true);

    await type('Fix it');
    expect(createButton().disabled).toBe(false);
    expect(text('.helper')).toBe('Required · 6/120');
  });

  it('limits the title to 120 characters', async () => {
    await create();

    const title = element().querySelector('ion-input.title') as unknown as {
      maxlength?: number;
    };
    expect(title.maxlength).toBe(120);
  });

  it('offers only the types the parent allows', async () => {
    await create();
    expect(
      sheet()
        .typeItems()
        .map((t) => t.id)
    ).toContain('MASTER');

    sheet().draft.update((d) => ({
      ...d,
      parent: { id: '6', taskKey: 'CHK-120', title: 'Epic', type: 'EPIC' },
    }));

    expect(
      sheet()
        .typeItems()
        .map((t) => t.id)
    ).not.toContain('MASTER');
  });

  it('drops the assignee, labels and parent when the project changes', async () => {
    await create();
    await type('Keep me');
    sheet().draft.update((d) => ({
      ...d,
      type: 'BUG',
      assigneeId: 'a2',
      labelNames: ['ios'],
      parent: { id: '6', taskKey: 'CHK-120', title: 'Epic', type: 'EPIC' },
    }));

    sheet().pickProject('p2');
    await settle();

    expect(sheet().draft()).toMatchObject({
      projectId: 'p2',
      title: 'Keep me',
      type: 'BUG',
      assigneeId: undefined,
      labelNames: [],
      parent: undefined,
    });
    expect(text('.project-name')).toBe('Billing');
  });

  it('says what the task will start as', async () => {
    await create();
    expect(text('.callout')).toBe('This task will start in To Do, unassigned.');

    sheet().draft.update((d) => ({ ...d, type: 'EPIC' }));
    await settle();
    expect(text('.callout')).toBe(
      'This epic will start in Backlog, unassigned.'
    );

    sheet().openPicker('assignee');
    sheet().pickAssignee('a1');
    await settle();
    expect(text('.callout')).toBe(
      'This epic will start in Backlog, assigned to you.'
    );
    expect(text('app-create-chip:has(.set)')).toBe('AR Me');
  });

  it('creates the task, then clears the form but its project and type when kept open', async () => {
    await create('p2');
    const announce = vi.spyOn(TestBed.inject(TaskCreateService), 'announce');
    await type('First');
    sheet().draft.update((d) => ({ ...d, type: 'BUG', priority: 'HIGH' }));
    sheet().keepOpen.set(true);

    await sheet().create();
    await settle();

    const task = created.mock.calls[0][0] as Task;
    expect(task).toMatchObject({
      taskKey: 'BIL-91',
      type: 'BUG',
      priority: 'HIGH',
    });
    expect(sheet().draft()).toEqual({
      projectId: 'p2',
      type: 'BUG',
      title: '',
      description: '',
      labelNames: [],
    });
    expect(announce).toHaveBeenCalledWith(
      expect.objectContaining({ task }),
      true,
      expect.any(Function)
    );
  });

  it('keeps what was typed when the server refuses', async () => {
    await create();
    vi.spyOn(api, 'createTask').mockRejectedValue(
      new ApiError(422, { message: 'Task quota exceeded' })
    );
    await type('Over quota');

    await sheet().create();
    await settle();

    expect(created).not.toHaveBeenCalled();
    expect(sheet().draft().title).toBe('Over quota');
    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Task quota exceeded' })
    );
    expect(createButton().disabled).toBe(false);
  });
});
