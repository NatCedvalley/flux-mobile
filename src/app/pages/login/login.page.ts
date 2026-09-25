import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
  IonText,
} from '@ionic/angular';
import { ApiError } from '@core/auth';
import { AuthService } from '../../auth/auth.service';

const NETWORK_ERROR = "Can't reach Flux. Check your connection and try again.";
const GENERIC_ERROR = 'Sign-in failed. Please try again.';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [
    ReactiveFormsModule,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonButton,
    IonSpinner,
    IonText,
  ],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly submitting = signal(false);
  // A signal, not `form.invalid` in the template: zoneless change detection
  // wouldn't re-render the button when typing makes the form valid.
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  protected readonly canSubmit = computed(
    () => this.formStatus() === 'VALID' && !this.submitting()
  );
  protected readonly errorMessage = signal<string | null>(null);
  /** Why the previous session ended, e.g. revoked from the web. */
  protected readonly endedMessage = this.auth.endedMessage;

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    const { email, password } = this.form.getRawValue();
    try {
      await this.auth.login(email, password);
      await this.router.navigateByUrl('/tabs/tasks', { replaceUrl: true });
    } catch (error) {
      this.errorMessage.set(messageFor(error));
    } finally {
      this.submitting.set(false);
    }
  }
}

/** The server's own message (e.g. locked account), else a fallback. */
function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return GENERIC_ERROR;
  }
  return (
    error.body.message ?? (error.status === 0 ? NETWORK_ERROR : GENERIC_ERROR)
  );
}
