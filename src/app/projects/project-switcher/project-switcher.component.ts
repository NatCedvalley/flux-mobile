import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonItemGroup,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonList,
  IonSearchbar,
  IonTitle,
  IonToolbar,
  type SearchbarCustomEvent,
} from '@ionic/angular';
import type { MyProject } from '@core/api';
import {
  isReadOnly,
  projectInitials,
  projectSubline,
  switcherGroups,
} from '@core/project-list';
import { projectSwatch } from '../project-colors';

/**
 * The project switcher sheet's content (handoff 3j): search, a Pinned group
 * and All projects. Swiping a row pins or unpins it; tapping it picks it.
 * The page hosts it in a sheet `ion-modal`.
 */
@Component({
  selector: 'app-project-switcher',
  templateUrl: './project-switcher.component.html',
  styleUrls: ['./project-switcher.component.scss'],
  imports: [
    NgTemplateOutlet,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonSearchbar,
    IonList,
    IonItemGroup,
    IonItemDivider,
    IonItemSliding,
    IonItem,
    IonItemOptions,
    IonItemOption,
    IonIcon,
  ],
  host: { class: 'ion-page' },
})
export class ProjectSwitcherComponent {
  readonly projects = input.required<readonly MyProject[]>();
  readonly currentId = input<string | null>(null);
  readonly pinnedIds = input<readonly string[]>([]);

  /** A project was picked. */
  readonly selected = output<MyProject>();
  readonly pinToggled = output<string>();
  readonly done = output();

  protected readonly search = signal('');
  protected readonly groups = computed(() =>
    switcherGroups(this.projects(), this.pinnedIds(), this.search())
  );
  protected readonly placeholder = computed(() => {
    const count = this.projects().length;
    return `Search ${count} project${count === 1 ? '' : 's'}`;
  });

  protected readonly initials = projectInitials;
  protected readonly subline = projectSubline;
  protected readonly readOnly = isReadOnly;

  protected swatch(project: MyProject): Record<string, string> {
    return isReadOnly(project) ? {} : projectSwatch(project.project?.id ?? '');
  }

  protected onSearch(event: SearchbarCustomEvent): void {
    this.search.set(event.detail.value ?? '');
  }

  protected togglePin(project: MyProject, sliding: IonItemSliding): void {
    void sliding.close();
    this.pinToggled.emit(project.project?.id ?? '');
  }
}
