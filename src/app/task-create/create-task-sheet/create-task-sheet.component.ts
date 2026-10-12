import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonModalToken,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import type { MyProject, Task, WorkflowStatus } from '@core/api';
import { dueFact, localIsoDate } from '@core/my-work';
import { avatarFillIndex, initials } from '@core/people';
import { priorityFact, projectInitials } from '@core/project-list';
import {
  type TaskDraft,
  afterCreate,
  allowedChildTypes,
  defaultsCallout,
  emptyDraft,
  createdStatus,
  withProject,
} from '@core/task-create';
import { TITLE_MAX, parentTypes } from '@core/task-edit';
import { PRIORITY_OPTIONS, assigneeOptions } from '@core/task-filters';
import { AttachSourceSheetComponent } from '../../attachments/attach-source-sheet/attach-source-sheet.component';
import {
  type FileSource,
  FileSourceService,
  type PickedFile,
} from '../../attachments/file-source.service';
import { PendingFilesComponent } from '../../attachments/pending-files/pending-files.component';
import { AuthService } from '../../auth/auth.service';
import { projectSwatch, projectTint } from '../../projects/project-colors';
import { FLUX_API } from '../../providers/flux-api.token';
import { DateSheetComponent } from '../../shared/date-sheet/date-sheet.component';
import {
  type PickerItem,
  PickerSheetComponent,
} from '../../shared/picker-sheet/picker-sheet.component';
import { TYPE_ICONS } from '../../shared/task-row/task-row.component';
import { AccessoryBarComponent } from '../accessory-bar/accessory-bar.component';
import { CreateChipComponent } from '../create-chip/create-chip.component';
import { TaskCreateService } from '../task-create.service';

/** The picker sheets the chips open, and the paperclip's source sheet. */
type Picker =
  | 'project'
  | 'type'
  | 'assignee'
  | 'priority'
  | 'due'
  | 'labels'
  | 'parent'
  | 'attach';

/** Parent candidates fetched per search. */
const PARENT_PAGE_SIZE = 20;

/** The modal role of a close after a create, which needs no discard check. */
const CREATED_ROLE = 'created';

const typeLabel = (type: string) => type[0] + type.slice(1).toLowerCase();

/**
 * The create sheet (handoff 3i), opened by `CreateTaskLauncherService`.
 * Project and type come first because they limit the rest; only the title
 * is required. The optional chips open FM-33's pickers, and a callout says
 * what the task will start as. A close that would lose what was entered
 * asks first, and "Keep the sheet open" clears the form after each create
 * instead of closing. The bar at the bottom attaches files (paperclip) and
 * photos (camera); they upload once the task exists.
 */
@Component({
  selector: 'app-create-task-sheet',
  templateUrl: './create-task-sheet.component.html',
  styleUrls: ['../../shared/sheet.scss', './create-task-sheet.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonIcon,
    IonInput,
    IonTextarea,
    IonToggle,
    IonModal,
    CreateChipComponent,
    PickerSheetComponent,
    DateSheetComponent,
    AttachSourceSheetComponent,
    PendingFilesComponent,
    AccessoryBarComponent,
  ],
  host: { class: 'ion-page' },
})
export class CreateTaskSheetComponent {
  private readonly api = inject(FLUX_API);
  private readonly creates = inject(TaskCreateService);
  private readonly alerts = inject(AlertController);
  private readonly fileSources = inject(FileSourceService);
  /**
   * The modal presenting the sheet; absent in specs. (Not `modal`: Ionic
   * reserves that name on a modal's component.)
   */
  private readonly sheetModal = inject<HTMLIonModalElement | null>(
    IonModalToken,
    {
      optional: true,
    }
  );
  private readonly account = inject(AuthService).account;
  private readonly myId = computed(() => this.account()?.id);

  /** The projects the caller may create in (EDITOR+). */
  readonly projects = input.required<readonly MyProject[]>();
  /** The project to start in. */
  readonly projectId = input.required<string>();
  /** The board column it was opened from, which the task moves to. */
  readonly status = input<WorkflowStatus>();
  /** Called after each create. */
  readonly created = input<(task: Task) => void>(() => undefined);
  /** Opens a created task, from its toast's Open. */
  readonly openTask = input<(task: Task) => void>(() => undefined);

  protected readonly titleMax = TITLE_MAX;
  protected readonly draft = linkedSignal<TaskDraft>(() =>
    emptyDraft(this.projectId())
  );
  protected readonly saving = signal(false);
  protected readonly keepOpen = signal(false);
  protected readonly keyboardOpen = signal(false);
  protected readonly picker = signal<Picker | undefined>(undefined);
  /** Files to attach once the task is created. */
  protected readonly files = signal<readonly PickedFile[]>([]);
  /** The paperclip's sources; the camera has its own button. */
  protected readonly attachSources = this.fileSources.sources.filter(
    (s) => s !== 'camera'
  );
  protected readonly canTakePhoto = this.fileSources.sources.includes('camera');
  /** The source chosen in the source sheet, run once it has closed. */
  private sourceChoice: FileSource | undefined;

  private readonly titleField = viewChild.required<IonInput>('titleField');
  private readonly descriptionField =
    viewChild.required<IonTextarea>('descriptionField');

  protected readonly canCreate = computed(
    () => !!this.draft().title.trim() && !this.saving()
  );
  /** Whether closing would lose anything entered. */
  readonly dirty = computed(() => {
    const d = this.draft();
    return (
      !!d.title.trim() ||
      !!d.description.trim() ||
      !!d.assigneeId ||
      !!d.priority ||
      !!d.dueDate ||
      d.labelNames.length > 0 ||
      !!d.parent ||
      this.files().length > 0
    );
  });

  protected readonly project = computed(() =>
    this.projects().find((p) => p.project?.id === this.draft().projectId)
  );
  protected readonly projectAvatar = computed(() => ({
    initials: projectInitials(this.project()?.project),
    style: projectTint(this.draft().projectId),
  }));
  protected readonly projectItems = computed(() =>
    this.projects().map((p): PickerItem => ({
      id: p.project?.id ?? '',
      key: p.project?.projectKey,
      label: p.project?.name ?? '',
      avatar: {
        initials: projectInitials(p.project),
        fill: projectSwatch(p.project?.id ?? '')['--project-fill'],
      },
    }))
  );

  protected readonly typeIcons = TYPE_ICONS;
  protected readonly typeLabel = typeLabel;
  /** The types the parent allows, every type without one. */
  protected readonly typeItems = computed(() =>
    allowedChildTypes(this.draft().parent?.type).map((type): PickerItem => ({
      id: type,
      label: typeLabel(type),
      icon: TYPE_ICONS[type],
    }))
  );

  protected readonly priorityItems: PickerItem[] = PRIORITY_OPTIONS.map(
    (option) => ({
      id: option.value,
      label: option.label,
      icon: priorityFact(option.value)?.icon,
    })
  );
  protected readonly priority = computed(() =>
    priorityFact(this.draft().priority)
  );
  /** Critical shows red and High amber, as on task detail. */
  protected readonly priorityTone = computed(() => {
    const level = this.priority()?.level;
    return level === 'CRITICAL'
      ? 'red'
      : level === 'HIGH'
        ? 'amber'
        : undefined;
  });

  /** The due chip: `Due today`, `Thu 17 Sep`, red once past. */
  protected readonly due = computed(() =>
    dueFact(this.draft().dueDate, localIsoDate(new Date()))
  );
  /** The labels chip: `safari`, or `safari +2`. */
  protected readonly labelsLabel = computed(() => {
    const [first, ...more] = this.draft().labelNames;
    return first && (more.length ? `${first} +${more.length}` : first);
  });

  /** The project's workflow, for the callout. */
  private readonly statuses = resource({
    params: () => this.draft().projectId,
    loader: ({ params }) => this.api.listWorkflowStatuses(params),
  });

  /** The project's members, fetched once the assignee picker opens. */
  private readonly membersWanted = signal(false);
  protected readonly members = resource({
    params: () =>
      this.membersWanted() || this.draft().assigneeId
        ? this.draft().projectId
        : undefined,
    loader: ({ params }) => this.api.listAssignableMembers(params),
  });
  private readonly memberOptions = computed(() =>
    this.members.hasValue()
      ? assigneeOptions(this.members.value(), this.myId())
      : undefined
  );
  protected readonly memberItems = computed(() => {
    const options = this.memberOptions();
    if (!options) {
      return undefined;
    }
    const rows = options.map((option): PickerItem => ({
      id: option.accountId,
      label: option.label,
      avatar: {
        initials: initials(option.person),
        fill: `var(--flux-avatar-${avatarFillIndex(option.accountId) + 1})`,
      },
    }));
    return this.draft().assigneeId
      ? [{ id: '', label: 'Unassigned', icon: 'x' }, ...rows]
      : rows;
  });
  /** The assignee chip: their name ("Me" for the caller) and avatar. */
  protected readonly assignee = computed(() => {
    const id = this.draft().assigneeId;
    const option = this.memberOptions()?.find((o) => o.accountId === id);
    return id && option
      ? {
          label: option.label,
          initials: initials(option.person),
          fill: `var(--flux-avatar-${avatarFillIndex(id) + 1})`,
        }
      : undefined;
  });

  /** The project's labels, fetched once the label picker opens. */
  private readonly labelsWanted = signal(false);
  protected readonly labels = resource({
    params: () => (this.labelsWanted() ? this.draft().projectId : undefined),
    loader: ({ params }) => this.api.listLabels(params),
  });
  /** Label names are unique in a project, so they serve as the rows' ids. */
  protected readonly labelItems = computed(() =>
    this.labels.hasValue()
      ? this.labels
          .value()
          .filter((l) => !!l.name)
          .map((l): PickerItem => ({ id: l.name ?? '', label: l.name ?? '' }))
      : undefined
  );
  protected readonly labelDraft = signal<readonly string[]>([]);

  /** What the parent picker searches for, sent once typing pauses. */
  protected readonly parentQuery = signal('');
  protected readonly parentResults = resource({
    params: () =>
      this.picker() === 'parent'
        ? {
            projectId: this.draft().projectId,
            type: parentTypes(this.draft().type).join(','),
            search: this.parentQuery() || undefined,
          }
        : undefined,
    loader: async ({ params }) =>
      (
        await this.api.listProjectTasks(params.projectId, {
          type: params.type,
          search: params.search,
          size: PARENT_PAGE_SIZE,
        })
      ).content ?? [],
  });
  protected readonly parentItems = computed(() => {
    if (!this.parentResults.hasValue()) {
      return undefined;
    }
    const rows = this.parentResults
      .value()
      .filter((t) => !!t.id)
      .map((t): PickerItem => ({
        id: t.id ?? '',
        key: t.taskKey,
        label: t.title ?? '',
        icon: TYPE_ICONS[t.type ?? 'EPIC'],
      }));
    return this.draft().parent
      ? [{ id: '', label: 'No parent', icon: 'x' }, ...rows]
      : rows;
  });

  /** `This bug will start in **To Do**, unassigned.`, once known. */
  protected readonly callout = computed(() => {
    const { type, projectId } = this.draft();
    // The column belongs to the project the sheet opened in.
    const target = projectId === this.projectId() ? this.status() : undefined;
    const { status, refused } = this.statuses.hasValue()
      ? createdStatus(this.statuses.value(), type, target)
      : { status: undefined, refused: undefined };
    if (!status?.name) {
      return undefined;
    }
    const assignee = this.assignee();
    const named =
      assignee &&
      (this.draft().assigneeId === this.myId() ? 'you' : assignee.label);
    return defaultsCallout(type, status.name, named || undefined, refused);
  });

  constructor() {
    if (this.sheetModal) {
      const modal = this.sheetModal;
      modal.canDismiss = (_data, role) => this.canClose(role);
      const focus = () => void this.titleField().setFocus();
      modal.addEventListener('ionModalDidPresent', focus);
      inject(DestroyRef).onDestroy(() =>
        modal.removeEventListener('ionModalDidPresent', focus)
      );
    }
    const shown = () => this.keyboardOpen.set(true);
    const hidden = () => this.keyboardOpen.set(false);
    window.addEventListener('ionKeyboardDidShow', shown);
    window.addEventListener('ionKeyboardDidHide', hidden);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('ionKeyboardDidShow', shown);
      window.removeEventListener('ionKeyboardDidHide', hidden);
    });
  }

  protected setTitle(value: string | null | undefined): void {
    this.draft.update((d) => ({ ...d, title: value ?? '' }));
  }

  protected setDescription(value: string | null | undefined): void {
    this.draft.update((d) => ({ ...d, description: value ?? '' }));
  }

  /** Enter in the title moves on to the description. */
  protected titleEntered(event: Event): void {
    event.preventDefault();
    void this.descriptionField().setFocus();
  }

  /** The keyboard bar's Done: puts the keyboard away. */
  protected closeKeyboard(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  protected openPicker(picker: Picker): void {
    if (picker === 'assignee') {
      this.membersWanted.set(true);
    } else if (picker === 'labels') {
      this.labelsWanted.set(true);
      this.labelDraft.set(this.draft().labelNames);
    } else if (picker === 'parent') {
      this.parentQuery.set('');
    }
    this.picker.set(picker);
  }

  /** A picker closed, however it was closed. */
  protected pickerClosed(picker: Picker): void {
    if (this.picker() === picker) {
      this.picker.set(undefined);
    }
    if (picker === 'labels') {
      this.draft.update((d) => ({ ...d, labelNames: this.labelDraft() }));
    } else if (picker === 'attach' && this.sourceChoice) {
      void this.attach(this.sourceChoice);
      this.sourceChoice = undefined;
    }
  }

  /** The paperclip: where from, or straight to the file picker on web. */
  protected openAttachSource(): void {
    if (this.attachSources.length === 1) {
      void this.attach(this.attachSources[0]);
      return;
    }
    this.sourceChoice = undefined;
    this.picker.set('attach');
  }

  protected chooseSource(source: FileSource): void {
    this.sourceChoice = source;
    this.picker.set(undefined);
  }

  /** Adds a file from `source` to the ones attached after the create. */
  protected async attach(source: FileSource): Promise<void> {
    const file = await this.fileSources.pick(source);
    if (file) {
      this.files.update((files) => [...files, file]);
    }
  }

  protected removeFile(index: number): void {
    this.files.update((files) => files.filter((_, i) => i !== index));
  }

  protected pickProject(id: string): void {
    this.draft.update((d) => withProject(d, id));
    this.picker.set(undefined);
  }

  protected pickType(type: string): void {
    this.draft.update((d) => ({ ...d, type: type as TaskDraft['type'] }));
    this.picker.set(undefined);
  }

  protected pickAssignee(id: string): void {
    this.draft.update((d) => ({ ...d, assigneeId: id || undefined }));
    this.picker.set(undefined);
  }

  protected pickPriority(priority: string): void {
    this.draft.update((d) => ({
      ...d,
      priority: priority as TaskDraft['priority'],
    }));
    this.picker.set(undefined);
  }

  protected pickDue(dueDate: string | undefined): void {
    this.draft.update((d) => ({ ...d, dueDate }));
    this.picker.set(undefined);
  }

  protected pickParent(id: string): void {
    // Read before closing: the results go with the sheet.
    const parent = this.parentResults.hasValue()
      ? this.parentResults.value().find((t) => t.id === id)
      : undefined;
    this.draft.update((d) => ({
      ...d,
      parent: parent && {
        id: parent.id,
        taskKey: parent.taskKey,
        title: parent.title,
        type: parent.type,
      },
    }));
    this.picker.set(undefined);
  }

  protected cancel(): void {
    void this.sheetModal?.dismiss(undefined, 'cancel');
  }

  protected async create(): Promise<void> {
    if (!this.canCreate()) {
      return;
    }
    const draft = this.draft();
    this.saving.set(true);
    const result = await this.creates.create(
      draft,
      this.labels.hasValue() ? this.labels.value() : [],
      this.files()
    );
    this.saving.set(false);
    if (!result) {
      return;
    }
    // Read now: the sheet may be gone by the time Open is tapped.
    const openTask = this.openTask();
    const keepOpen = this.keepOpen();
    this.created()(result.task);
    this.draft.set(afterCreate(draft));
    this.files.set([]);
    if (keepOpen) {
      void this.titleField().setFocus();
    } else {
      await this.sheetModal?.dismiss(undefined, CREATED_ROLE);
    }
    void this.creates.announce(result, keepOpen, () => {
      void this.openCreated(result.task, openTask);
    });
  }

  private async openCreated(
    task: Task,
    openTask: (task: Task) => void
  ): Promise<void> {
    // Still open (kept open): close it first, unless Discard is declined.
    if (this.sheetModal?.isConnected && !(await this.sheetModal.dismiss())) {
      return;
    }
    openTask(task);
  }

  /** Lets the sheet close, asking first when that would lose anything. */
  private async canClose(role: string | undefined): Promise<boolean> {
    if (role === CREATED_ROLE || !this.dirty()) {
      return true;
    }
    const alert = await this.alerts.create({
      header: 'Discard this task?',
      message: 'What you’ve entered will be lost.',
      buttons: [
        { text: 'Keep editing', role: 'cancel' },
        { text: 'Discard', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role: choice } = await alert.onDidDismiss();
    return choice === 'destructive';
  }
}
