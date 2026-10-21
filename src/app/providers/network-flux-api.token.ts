import { InjectionToken } from '@angular/core';
import type { FluxApi } from '@core/api';

/**
 * The `FluxApi` that always goes to the server: `FLUX_API` without its read
 * cache or the queued statuses it overlays. Only the write queue's replay
 * uses it, so its check of a task's status is never a saved copy.
 */
export const NETWORK_FLUX_API = new InjectionToken<FluxApi>('NETWORK_FLUX_API');
