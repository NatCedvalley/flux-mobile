import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';
import { CrashReportingService } from './crash-reporting.service';

/**
 * Angular's handler, which still logs to the console, plus a Crashlytics
 * report. `provideBrowserGlobalErrorListeners()` sends it uncaught errors
 * and unhandled rejections from outside Angular too.
 */
@Injectable()
export class CrashErrorHandler extends ErrorHandler {
  // Looked up on the first error: Angular builds the ErrorHandler before
  // the services the reporter needs, some of which may need it.
  private readonly injector = inject(Injector);

  override handleError(error: unknown): void {
    super.handleError(error);
    try {
      void this.injector.get(CrashReportingService).record(error);
    } catch (failure) {
      console.error('Recording an error failed', failure);
    }
  }
}
