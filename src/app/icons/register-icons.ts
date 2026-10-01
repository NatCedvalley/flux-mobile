import { addIcons } from 'ionicons';
import icons from './lucide-icons.json';

/**
 * The design handoff's icon set (docs/design/mobile-v2/assets/icons.json, a
 * Lucide subset copied from flux-web): SVG bodies keyed by name, drawn on a
 * 24×24 grid with a 2px round stroke in `currentColor` and no fill.
 */
const LUCIDE_ROOT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round">';

/**
 * Every handoff icon as a `;utf8,` data URL, keyed by its Lucide name, so
 * `ion-icon` never fetches anything. The markup must stay unencoded:
 * ionicons parses it straight out of the URL string.
 */
export function fluxIconUrls(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(icons as Record<string, string>).map(([name, body]) => [
      name,
      `data:image/svg+xml;utf8,${LUCIDE_ROOT}${body}</svg>`,
    ])
  );
}

/**
 * Registers every handoff icon with ionicons, so templates use
 * `<ion-icon name="list-todo">`.
 */
export function registerFluxIcons(): void {
  addIcons(fluxIconUrls());
}
