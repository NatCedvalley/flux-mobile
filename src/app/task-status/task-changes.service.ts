import { Injectable, signal } from '@angular/core';
import type { Task } from '@core/api';

/** A task changed on this device; `removed` when it was deleted. */
export type ReportedChange = { task: Task; removed: boolean };

/**
 * The last task changed on this device, fetched again from the server, so
 * a screen further back in the stack (the Projects list under task detail)
 * can show the change without a refetch.
 */
@Injectable({ providedIn: 'root' })
export class TaskChangesService {
  private readonly last = signal<ReportedChange | undefined>(undefined);
  readonly changed = this.last.asReadonly();

  report(task: Task, removed = false): void {
    this.last.set({ task, removed });
  }
}
