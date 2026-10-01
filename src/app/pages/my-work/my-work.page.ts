import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonSpinner,
} from '@ionic/angular';
import { avatarFillIndex, initials } from '@core/people';
import { AuthService } from '../../auth/auth.service';
import { FLUX_API } from '../../providers/flux-api.token';

/**
 * Home tab. For now the title block, the avatar that opens Settings, and the
 * mock task list; FM-28 replaces the list with the real My Work screen.
 */
@Component({
  selector: 'app-my-work',
  templateUrl: './my-work.page.html',
  styleUrls: ['./my-work.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonSpinner,
  ],
})
export class MyWorkPage {
  private readonly api = inject(FLUX_API);
  private readonly account = inject(AuthService).account;

  protected readonly tasks = resource({
    loader: () => this.api.listTasks(),
  });

  protected readonly avatarInitials = computed(() =>
    initials(this.account() ?? {})
  );
  protected readonly avatarFill = computed(() => {
    const account = this.account();
    const index = avatarFillIndex(account?.id ?? account?.email ?? '');
    return `var(--flux-avatar-${index + 1})`;
  });
}
