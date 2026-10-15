import { Component, computed, input, output } from '@angular/core';
import { IonIcon, IonItem } from '@ionic/angular';
import type { AppNotification } from '@core/api';
import { notificationView } from '@core/inbox';
import { relativeTime } from '@core/task-detail';

/**
 * An Inbox row (handoff 3l): the actor's avatar or the event's glyph, then
 * the actor, verb and age, the subject, and the task's key and project.
 * Unread rows carry the indigo rail and a bolder lead. The page decides
 * what a tap does.
 */
@Component({
  selector: 'app-notification-row',
  templateUrl: './notification-row.component.html',
  styleUrls: ['./notification-row.component.scss'],
  imports: [IonItem, IonIcon],
})
export class NotificationRowComponent {
  readonly notification = input.required<AppNotification>();
  /** The moment the age is counted from. */
  readonly now = input.required<Date>();
  readonly opened = output<void>();

  protected readonly view = computed(() =>
    notificationView(this.notification())
  );
  protected readonly avatar = computed(() => {
    const leading = this.view().leading;
    return leading.kind === 'avatar'
      ? {
          initials: leading.initials,
          fill: `var(--flux-avatar-${leading.fillIndex + 1})`,
        }
      : undefined;
  });
  protected readonly glyph = computed(() => {
    const leading = this.view().leading;
    return leading.kind === 'glyph' ? leading : undefined;
  });
  protected readonly age = computed(() =>
    relativeTime(this.notification().createdAt, this.now())
  );
}
