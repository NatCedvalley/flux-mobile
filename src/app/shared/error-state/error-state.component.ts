import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { ApiError } from '@core/auth';

/** A list that failed to load: what went wrong, and a Retry button. */
@Component({
  selector: 'app-error-state',
  templateUrl: './error-state.component.html',
  styleUrls: ['../list-state.scss'],
  imports: [IonButton, IonIcon],
})
export class ErrorStateComponent {
  /** The load's error. An `ApiError` with status 0 means no response. */
  readonly error = input<unknown>();
  /** What failed to load, as in "Something went wrong loading this list." */
  readonly subject = input('this list');
  readonly retry = output();

  protected readonly offline = computed(() => {
    const error = this.error();
    return error instanceof ApiError && error.status === 0;
  });
}
