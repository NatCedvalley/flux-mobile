# Design mockups

Claude Design mockups for Flux Mobile live in this folder, one subfolder per
screen, e.g.:

```
docs/design/
├── tasks-list/
├── task-detail/
├── notifications/
└── settings/
```

When a mockup finalizes a color, spacing, radius or font decision, update
[`src/theme/tokens.scss`](../../src/theme/tokens.scss) with the real value —
never hard-code a color or spacing value directly in a component's styles.
`src/theme/variables.scss` derives every Ionic CSS variable from that one
file, so a token change there propagates everywhere.
