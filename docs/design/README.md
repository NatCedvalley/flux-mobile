# Design mockups

The current design is the Claude Design handoff in
[`mobile-v2/`](mobile-v2/README.md), committed as delivered:

| File                                | What it is                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `mobile-v2/README.md`               | **The spec**: tokens, the 14 screens (`3a`–`3n`), the Ionic component mapping, and interaction rules.      |
| `mobile-v2/Flux Mobile v2.dc.html`  | The screens, light and dark, on one canvas. Open it in Chrome or Safari from its folder.                     |
| `mobile-v2/support.js`              | Runtime that renders the HTML reference only. Never port it into the app.                                   |
| `mobile-v2/assets/`                 | The Inter and CommitMono fonts, the Lucide icon set (`icons.json`) and the brand marks.                      |
| `mobile-v2/reference/`              | The existing flux-web screens, for label, enum and data parity.                                              |

Recreate screens with Ionic primitives, as the spec's "Ionic component
mapping" describes, not by copying the HTML's markup or inline styles.

The app's copies of the fonts (`src/theme/fonts/`) and icons
(`src/app/icons/lucide-icons.json`) come from `mobile-v2/assets/`. When a
design changes a colour, spacing, radius or type value, update
[`src/theme/tokens.scss`](../../src/theme/tokens.scss) with the real value —
never hard-code a colour or spacing value in a component's styles.
`src/theme/variables.scss` derives every `--flux-*` and Ionic CSS variable
from that one file, so a token change there propagates everywhere.

A later handoff goes in its own folder (`mobile-v3/`, …) next to this one.
