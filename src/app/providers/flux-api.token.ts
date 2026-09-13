import { InjectionToken } from '@angular/core';
import type { FluxApi } from '@core/api';

/**
 * The only bridge between Angular and the framework-agnostic `FluxApi`.
 * Swapping the mock for a real HTTP implementation is a one-line change to
 * the provider in `main.ts` — no call site changes.
 */
export const FLUX_API = new InjectionToken<FluxApi>('FLUX_API');
