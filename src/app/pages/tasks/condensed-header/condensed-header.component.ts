import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import type { StatusPill } from '../status-pill';

/**
 * Task detail's header condensed on scroll (3f, 3g): the key with the status
 * inline, then the title on one line, in the nav row. For an EDITOR+ the
 * status is a button, as the full header's pill is; the page opens the
 * status sheet.
 */
@Component({
  selector: 'app-condensed-header',
  templateUrl: './condensed-header.component.html',
  styleUrls: ['./condensed-header.component.scss'],
  imports: [IonIcon],
})
export class CondensedHeaderComponent {
  readonly taskKey = input<string>();
  readonly title = input<string>();
  readonly status = input<StatusPill>();
  /** Whether the caller may change the status (a button, not a span). */
  readonly canMove = input(false);
  readonly statusDisabled = input(false);
  /** A status change still to send: the sync glyph. */
  readonly pending = input(false);

  readonly changeStatus = output();
}
