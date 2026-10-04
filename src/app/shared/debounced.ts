import { type Signal, effect, signal, untracked } from '@angular/core';

/** How long typing must pause before a search is sent. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * `source`, updated only once it has stopped changing for `ms`. Call it in
 * an injection context (a field initializer).
 */
export function debounced<T>(source: Signal<T>, ms: number): Signal<T> {
  const value = signal(untracked(source));
  effect((onCleanup) => {
    const next = source();
    const timer = setTimeout(() => value.set(next), ms);
    onCleanup(() => clearTimeout(timer));
  });
  return value.asReadonly();
}
