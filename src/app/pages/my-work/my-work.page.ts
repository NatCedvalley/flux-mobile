import { DatePipe } from '@angular/common';
import {
  Component,
  type ResourceRef,
  computed,
  effect,
  inject,
  resource,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItemDivider,
  IonItemGroup,
  IonLabel,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
  NavController,
  type RefresherCustomEvent,
  type SegmentCustomEvent,
} from '@ionic/angular';
import type { MyTask, Page } from '@core/api';
import { FOCUS_DAYS, addDays, focusBuckets, localIsoDate } from '@core/my-work';
import { avatarFillIndex, initials } from '@core/people';
import { can } from '@core/permissions';
import { initialProject } from '@core/project-list';
import { AuthService } from '../../auth/auth.service';
import { MyProjectsService } from '../../projects/my-projects.service';
import { ProjectPrefsService } from '../../projects/project-prefs.service';
import { FLUX_API } from '../../providers/flux-api.token';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { SkeletonRowsComponent } from '../../shared/skeleton-rows/skeleton-rows.component';
import { TaskRowComponent } from '../../shared/task-row/task-row.component';
import { CreateTaskFabComponent } from '../../task-create/create-task-fab/create-task-fab.component';
import { CreateTaskLauncherService } from '../../task-create/create-task-launcher.service';

type Segment = 'assigned' | 'focus' | 'watching';

/** One page is plenty for a person's open tasks; the server caps it at 100. */
const PAGE_SIZE = 100;

const EMPTY_MESSAGES: Record<Segment, string> = {
  focus: 'Nothing due in the next 7 days.',
  assigned: 'No open tasks assigned to you.',
  watching: "You're not watching any open tasks.",
};

/**
 * Home tab (handoff 3a): the user's open tasks across every project. Focus
 * groups the assigned ones due soon into Overdue, Today and Next 7 days; All
 * assigned and Watching list everything, in the server's order (priority,
 * then due date). An EDITOR+ in any project gets the create button, which
 * starts in the project opened last.
 */
@Component({
  selector: 'app-my-work',
  templateUrl: './my-work.page.html',
  styleUrls: ['./my-work.page.scss'],
  imports: [
    DatePipe,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonContent,
    IonIcon,
    IonItemDivider,
    IonItemGroup,
    IonLabel,
    IonList,
    IonRefresher,
    IonRefresherContent,
    IonSegment,
    IonSegmentButton,
    CreateTaskFabComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonRowsComponent,
    TaskRowComponent,
  ],
})
export class MyWorkPage {
  private readonly api = inject(FLUX_API);
  private readonly account = inject(AuthService).account;
  private readonly myProjects = inject(MyProjectsService);
  private readonly prefs = inject(ProjectPrefsService);
  private readonly creates = inject(CreateTaskLauncherService);
  private readonly nav = inject(NavController);
  private readonly route = inject(ActivatedRoute);

  protected readonly segment = signal<Segment>('focus');
  /** The local day. Read again on refresh, so Focus rolls over at midnight. */
  protected readonly today = signal(localIsoDate(new Date()));
  protected readonly todayDate = computed(() => {
    const [year, month, day] = this.today().split('-').map(Number);
    return new Date(year, month - 1, day);
  });

  protected readonly focus = resource({
    params: () => ({ dueDateTo: addDays(this.today(), FOCUS_DAYS) }),
    loader: ({ params }) =>
      this.api.listMyTasks({
        scope: 'assigned',
        openOnly: true,
        dueDateTo: params.dueDateTo,
        size: PAGE_SIZE,
      }),
  });
  /** Also gives the subtitle's count, so it loads up front. */
  protected readonly assigned = resource({
    loader: () =>
      this.api.listMyTasks({
        scope: 'assigned',
        openOnly: true,
        size: PAGE_SIZE,
      }),
  });
  /** Loaded the first time Watching is opened. */
  private readonly watchingOpened = signal(false);
  protected readonly watching = resource({
    params: () => (this.watchingOpened() ? {} : undefined),
    loader: () =>
      this.api.listMyTasks({
        scope: 'watching',
        openOnly: true,
        size: PAGE_SIZE,
      }),
  });

  /** The resource behind the selected segment. */
  protected readonly current = computed<ResourceRef<Page<MyTask> | undefined>>(
    () => {
      switch (this.segment()) {
        case 'focus':
          return this.focus;
        case 'assigned':
          return this.assigned;
        case 'watching':
          return this.watching;
      }
    }
  );
  protected readonly rows = computed(() => {
    const current = this.current();
    return current.hasValue() ? (current.value()?.content ?? []) : [];
  });
  protected readonly buckets = computed(() =>
    focusBuckets(
      this.focus.hasValue() ? (this.focus.value()?.content ?? []) : [],
      this.today()
    )
  );
  protected readonly focusEmpty = computed(() => {
    const { overdue, today, next7 } = this.buckets();
    return overdue.length + today.length + next7.length === 0;
  });
  protected readonly assignedCount = computed(() =>
    this.assigned.hasValue() ? this.assigned.value()?.totalElements : undefined
  );
  protected readonly emptyMessage = computed(
    () => EMPTY_MESSAGES[this.segment()]
  );

  protected readonly avatarInitials = computed(() =>
    initials(this.account() ?? {})
  );
  protected readonly avatarFill = computed(() => {
    const account = this.account();
    const index = avatarFillIndex(account?.id ?? account?.email ?? '');
    return `var(--flux-avatar-${index + 1})`;
  });

  /** The projects the user may create tasks in; none hides the button. */
  private readonly creatable = resource({
    loader: async () =>
      (await this.myProjects.load()).filter((p) => can(p.role, 'create')),
  });
  protected readonly canCreate = computed(
    () => this.creatable.hasValue() && this.creatable.value().length > 0
  );

  /** The pull-to-refresh in progress, completed once its reload settles. */
  private readonly refresher = signal<
    RefresherCustomEvent['target'] | undefined
  >(undefined);

  constructor() {
    effect(() => {
      const refresher = this.refresher();
      if (refresher && !this.current().isLoading()) {
        void refresher.complete();
        this.refresher.set(undefined);
      }
    });
  }

  protected select(event: SegmentCustomEvent): void {
    const segment = event.detail.value as Segment;
    if (segment === 'watching') {
      this.watchingOpened.set(true);
    }
    this.segment.set(segment);
  }

  /** Reloads the visible segment, and the count in the subtitle. */
  protected refresh(event: RefresherCustomEvent): void {
    this.today.set(localIsoDate(new Date()));
    const current = this.current();
    current.reload();
    if (current !== this.assigned) {
      this.assigned.reload();
    }
    // Set after the reloads start, so the effect sees them loading.
    this.refresher.set(event.target);
  }

  /**
   * Opens the create sheet (3i) on the project opened last on the Projects
   * tab, else the first pinned one, else the first listed.
   */
  protected async openCreate(): Promise<void> {
    if (!this.creatable.hasValue()) {
      return;
    }
    const projects = this.creatable.value();
    const [lastId] = await Promise.all([
      this.prefs.lastProjectId(),
      this.prefs.load(),
    ]);
    const projectId = initialProject(projects, lastId, this.prefs.pinned())
      ?.project?.id;
    if (!projectId) {
      return;
    }
    await this.creates.open({
      projects,
      projectId,
      // My Work's rows carry project and status names a created task
      // lacks, and only some lists take it, so they load again.
      created: () => this.reloadLists(),
      openTask: (task) =>
        void this.nav.navigateForward(['tasks', task.projectId, task.id], {
          relativeTo: this.route,
          state: { task },
        }),
    });
  }

  /** Reloads the visible segment, and the subtitle's count if it failed too. */
  protected retry(): void {
    this.current().reload();
    if (this.assigned.error()) {
      this.assigned.reload();
    }
  }

  private reloadLists(): void {
    this.focus.reload();
    this.assigned.reload();
    if (this.watchingOpened()) {
      this.watching.reload();
    }
  }
}
