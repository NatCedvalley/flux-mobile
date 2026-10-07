import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  resource,
} from '@angular/core';
import {
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSkeletonText,
} from '@ionic/angular';
import type { Task, TaskResolution, WorkflowStatus } from '@core/api';
import { statusHue } from '@core/project-list';
import { statusSheetGroups, type StatusSheetRow } from '@core/task-status';
import { groupHueColors } from '../../projects/project-colors';
import { FLUX_API } from '../../providers/flux-api.token';

/** A status chosen in the sheet, with its resolution when it's closed. */
export type StatusChoice = { status: WorkflowStatus; resolution?: string };

/**
 * The status sheet (handoff 3h): the project's statuses grouped by category,
 * the current one and the suggested next marked, and the ones the task's
 * type can't use shown disabled with the reason. A tap moves the task. A
 * closed status first opens its resolution picker inline, since it can't be
 * chosen without one.
 */
@Component({
  selector: 'app-status-sheet',
  templateUrl: './status-sheet.component.html',
  styleUrls: ['../../shared/sheet.scss', './status-sheet.component.scss'],
  imports: [IonList, IonItem, IonLabel, IonIcon, IonButton, IonSkeletonText],
  host: { class: 'ion-page' },
})
export class StatusSheetComponent {
  private readonly api = inject(FLUX_API);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly task = input.required<Task>();
  /** The project's statuses in workflow order (`workflowOrder`). */
  readonly statuses = input.required<readonly WorkflowStatus[]>();
  readonly projectName = input<string>();
  /** A closed status to open with its resolution picker showing. */
  readonly expand = input<string>();

  readonly moved = output<StatusChoice>();
  readonly done = output();

  protected readonly groups = computed(() =>
    statusSheetGroups(this.statuses(), this.task())
  );
  /** The closed status whose resolution picker is open. */
  protected readonly expanded = linkedSignal(() => this.expand());

  protected readonly resolutions = resource({
    params: () => (this.expanded() ? this.task().projectId : undefined),
    loader: ({ params }) => this.api.listResolutions(params),
  });

  protected readonly subtitle = computed(() =>
    [
      this.task().taskKey,
      this.projectName() && `${this.projectName()} workflow`,
    ]
      .filter(Boolean)
      .join(' · ')
  );

  constructor() {
    // An opened picker can fall below the sheet's fold: bring it into view
    // once its resolutions are listed.
    afterRenderEffect(() => {
      if (this.expanded() && this.resolutions.hasValue()) {
        this.host.nativeElement
          .querySelector('.resolutions')
          ?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  protected colors(status: WorkflowStatus): Record<string, string> {
    return groupHueColors(statusHue(status.color, status.category));
  }

  protected choose(row: StatusSheetRow): void {
    if (row.current) {
      this.done.emit();
    } else if (row.blocked) {
      return;
    } else if (row.needsResolution) {
      this.expanded.update((slug) =>
        slug === row.status.slug ? undefined : row.status.slug
      );
    } else {
      this.moved.emit({ status: row.status });
    }
  }

  protected resolve(status: WorkflowStatus, resolution: TaskResolution): void {
    this.moved.emit({ status, resolution: resolution.slug });
  }
}
