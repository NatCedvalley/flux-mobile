import { Component, input, output } from '@angular/core';
import {
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  type SegmentCustomEvent,
} from '@ionic/angular';
import type { ViewMode } from '@core/project-list';

/**
 * The Projects tab's List / Board switch (handoff 3b, 3c): a 36px
 * segmented control like My Work's, an icon before each label.
 */
@Component({
  selector: 'app-view-segment',
  templateUrl: './view-segment.component.html',
  styleUrls: ['./view-segment.component.scss'],
  imports: [IonIcon, IonLabel, IonSegment, IonSegmentButton],
})
export class ViewSegmentComponent {
  readonly view = input.required<ViewMode>();
  readonly viewChange = output<ViewMode>();

  protected changed(event: SegmentCustomEvent): void {
    const view = event.detail.value as ViewMode;
    if (view !== this.view()) {
      this.viewChange.emit(view);
    }
  }
}
