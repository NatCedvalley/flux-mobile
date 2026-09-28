# Handoff: Flux mobile app (Ionic + Angular + Capacitor)

## Overview

A native-feeling mobile client for flux-web, the existing Angular project/task tracker. It covers the daily loop for three audiences — engineers, leads/managers, and read-only stakeholders — across seven surfaces: My Work (home), a project's Task List / Board / Calendar, Task detail (Details / Comments / Activity), quick task creation, project switching, Releases, and Inbox.

The design is a deliberate overhaul of a first pass. Its five rules are worth keeping while implementing, because most layout decisions follow from them:

1. **One primary action per screen.** Lists get a single FAB; detail gets a single docked button that names the next workflow status.
2. **Status is never colour alone.** Always a coloured dot plus the status word. Group headers carry the status so rows stay quiet.
3. **Two facts of metadata per row, maximum** (plus assignee avatar). Everything else moves to detail.
4. **Every choice is a bottom sheet**, not a top-anchored menu — the thumb never has to reach the top of the screen.
5. **Chrome collapses.** The old three filter chips became one Filters button with a count badge; grouping is a text button; view switching is one segmented control.

## About the design files

The files in this bundle are **design references authored in HTML** — prototypes of intended look, hierarchy, and behaviour. They are **not production code to copy**. `Flux Mobile v2.dc.html` is a single static document that paints 14 phone-sized screens side by side on a canvas; it uses a small in-house runtime (`support.js`) purely to render the document. Do not port that runtime, its `<x-dc>` / `<sc-if>` tags, or its inline-style authoring approach.

**The task is to recreate these screens in flux-web's mobile stack** — Ionic components + Angular standalone components + Capacitor — reusing the existing app's services, models, enums, permission guards, and view-preference resolution. Where an Ionic primitive matches the design (`ion-item-sliding` for swipe actions, `ion-modal` with `breakpoints` for sheets, `ion-segment`, `ion-tabs`, `ion-refresher`), use it and restyle it to the token values below rather than hand-building the interaction.

To view the references: open `Flux Mobile v2.dc.html` in a browser (Chrome/Safari) from this folder — it needs `support.js`, `assets/icons.js`, and `assets/fonts/*` as siblings, all included. `reference/Flux Web Current.dc.html` shows the corresponding **existing web** screens, for parity checks on labels and data.

## Fidelity

**High fidelity.** Colours, type, spacing, radii, icon sizes, and copy are final and should be matched. The only intentionally loose parts:

- Illustrations/imagery: none used. No placeholder art to replace.
- Motion: durations/easings are specified below in prose, not animated in the HTML.
- Text lengths are realistic samples; real data must truncate as described per row.

## Design tokens

The app uses the **Radix UI colour scales** already present in flux-web (gray as the neutral, indigo as the primary, plus semantic hues). Token names below match the CSS custom properties used in the prototype; map them onto flux-web's existing token layer rather than introducing new names. Alpha tokens (`--na*`, `--pa*`) are the composited-on-background variants and are what borders/backgrounds use.

### Neutrals (gray)

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--n1` | `#FCFCFD` | `#111113` | segmented active chip (light) |
| `--n2` | `#F9F9FB` | `#18191B` | app canvas / panel |
| `--n3` | `#F0F0F3` | `#212225` | segmented track, input fill, chip fill |
| `--n4` | `#E8E8EC` | `#272A2D` | avatar placeholder fill, sheet cancel (dark) |
| `--n5` | `#E0E1E6` | `#2E3135` | control borders, segmented active (dark) |
| `--n6` | `#D9D9E0` | `#363A3F` | sheet grabber (light), dashed chip border |
| `--n8` | `#B9BBC6` | `#5A6169` | Backlog status dot, disabled text |
| `--n9` | `#8B8D98` | `#696E77` | placeholder text |
| `--n11` | `#60646C` | `#B0B4BA` | secondary text (solid) |
| `--n12` | `#1C2024` | `#EDEEF0` | primary text, home indicator |

Alpha neutrals (light → dark): `--na2` `rgba(0,0,85,.024)` → `rgba(216,244,246,.03)`; `--na3` `rgba(0,0,71,.06)` → `rgba(221,235,253,.07)`; `--na4` `rgba(0,0,60,.09)` → `rgba(211,237,248,.11)`; `--na5` `rgba(0,8,53,.12)` → `rgba(217,237,254,.14)`; `--na6` `rgba(0,0,46,.15)` → `rgba(214,235,253,.18)`; `--na7` `rgba(0,6,40,.2)` → `rgba(217,235,254,.24)`; `--na8` `rgba(0,4,32,.27)` → `rgba(217,236,254,.35)`; `--na9` `rgba(0,3,20,.45)` → `rgba(223,236,253,.41)`; `--na10` `rgba(0,3,18,.5)` → `rgba(229,239,254,.46)`; `--na11` `rgba(0,6,20,.62)` → `rgba(240,247,254,.68)`.

Row dividers use `--na3`; section/structural dividers use `--na4`; control outlines use `--na4`/`--na5`.

### Primary (indigo)

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--p9` | `#3E63DD` | `#3E63DD` | FAB, primary button, active tab icon+label, unread rail |
| `--p10` | `#3358D4` | `#5472E4` | primary button inner top highlight |
| `--p11` / `--pa11` | `#3A5BC7` | `#9EB1FF` | links, task keys, tinted-button text |
| `--pa2` | `rgba(0,64,255,.03)` | `rgba(21,71,255,.09)` | selected row wash |
| `--pa3` | `rgba(0,68,255,.07)` | `rgba(37,85,255,.2)` | tinted chip/badge background |
| `--pa4` | `rgba(0,68,255,.12)` | `rgba(55,98,255,.31)` | send button fill, active tab badge |

Dark mode active tab label/icon uses `--p11` (`#9EB1FF`), not `--p9`, for contrast.

### Semantic / status hues

Step 9 is the dot/fill; step 11 is the text colour; the `a3` alpha is the pill background. Step 9 values are shared across light and dark (Radix step 9 is theme-stable); step 11 changes.

| Meaning | 9 | 11 light | 11 dark | a3 light | a3 dark |
|---|---|---|---|---|---|
| To Do (blue) | `#0090FF` | `#0D74CE` | `#70B8FF` | `rgba(0,128,255,.11)` | `rgba(0,111,255,.2)` |
| In Progress (amber) | `#FFC53D` | `#AB6400` | `#FFCA16` | `rgba(255,222,0,.22)` | `rgba(255,178,0,.12)` |
| In Review (purple) | `#8E4EC6` | `#8145B5` | `#D19DFF` | `rgba(120,0,255,.08)` | `rgba(160,80,255,.2)` |
| QA (cyan) | `#00A2C7` | `#107D98` | `#4CCCE6` | `rgba(0,180,240,.11)` | `rgba(0,190,255,.18)` |
| Done (green) | `#30A46C` | `#218358` | `#3DD68C` | `rgba(0,164,51,.1)` | `rgba(0,235,110,.12)` |
| Overdue / Urgent / destructive (red) | `#E5484D` | `#CE2C31` | `#FF9592` | `rgba(255,1,13,.09)` | `rgba(255,80,85,.2)` |
| Release (violet) | `#6E56CF` | `#6550B9` | `#BAA7FF` | `rgba(60,0,255,.08)` | `rgba(120,90,255,.2)` |
| Backlog | `#B9BBC6` (`--n8`) | `--na11` | `--na11` | `--na2` | `--na2` |

Extra alphas used on the calendar: `--ambera2` `rgba(255,222,0,.08)`, `--greena2` `rgba(0,164,51,.05)`.

Avatar fills (deterministic per user, from the same scale): violet `#6E56CF`, teal `#12A594`, pink `#D6409F`, cyan `#00A2C7`, orange `#F76B15`, purple `#8E4EC6`. Avatar text is always `#fff` at weight 650.

### Surfaces

| Token | Light | Dark |
|---|---|---|
| `--bg` (content surface, headers, rows, tab bar) | `#fff` | `#111113` |
| `--panel` (app canvas behind cards/rows, dark tab bar) | `#F9F9FB` | `#18191B` |
| `--surface` (card, sheet, dark row) | `#fff` | `#212225` |

In light mode rows sit on `--bg` over a `--panel` canvas. In dark mode the row surface steps **up** to `--surface` (`#212225`) over the `--panel` canvas (`#18191B`) — surfaces get lighter with elevation, never darker.

### Typography

Families: **Inter** (variable, weights 400–700, `font-feature-settings:'salt'`) for UI; **CommitMono** (variable) for task keys, version numbers, and inline code. Both are bundled in `assets/fonts/`. Body default: 13px / 20px / weight 450, `-webkit-font-smoothing: antialiased`.

| Role | Size / line-height | Weight | Letter-spacing |
|---|---|---|---|
| Screen title (My Work, Inbox, Releases) | 22 / 26 | 700 | −0.02em |
| Screen subtitle | 12 / 16 | 450 | — |
| Sheet title | 16 | 700 | −0.01em |
| Task detail title | 19 / 24 | 650 | −0.02em |
| Project name in header | 16 / 19 | 650 | −0.01em |
| Row title (list + My Work) | 15 / 19 | 550 | — |
| Board card title | 14.5 / 19 | 550 | — |
| Sheet list item | 15 | 550–650 | — |
| Tab label (segmented, tabs) | 13–13.5 | 500 inactive / 600–650 active | — |
| Row metadata | 11.5 / 15 | 450, 600 when emphasised | — |
| Section header (uppercase) | 11 | 700 | 0.05em |
| Field label (uppercase, in cards) | 11 | 650 | 0.04em |
| Task key (mono) | 11–13.5 | 550–650 | — |
| Bottom-tab label | 10 | 550 inactive / 650 active | — |
| Status-bar clock | 15 | 600 | — |

Minimum type size anywhere is 10px and only for tab labels/badges; no body text below 11.5px.

### Spacing, radii, elevation

- Screen gutter: **16px**. Card inner padding: 12–14px. Sheet gutter: 16px.
- Vertical rhythm: 8 / 10 / 12 / 14 / 16. Card gaps: 10–12px.
- Fixed heights: status bar 54, nav/header row 48–52, segmented control 36 (3px inset, 9px inner radius), filter/meta strip 38, group header 34–36, list row 62, My Work row 68, sheet row 52–54, tab bar 84 (52 items + 32 home-indicator area), docked action bar 48 + 34 safe area.
- Radii: pills 99, chips/buttons 8–10, cards 12–14, primary/docked buttons 13, sheets 22 (top corners only), phone frame 44, avatars 99.
- Shadows: card `0 0 0 1px var(--na4), 0 1px 2px rgba(0,0,0,.04)`; docked bar `0 -4px 20px rgba(0,0,0,.06)`; sheet `0 -12px 40px rgba(0,0,0,.28)` (dark `.5`); FAB `0 1px 0 var(--p10) inset, 0 10px 24px rgba(62,99,221,.4)`; segmented active chip `0 1px 2px rgba(0,0,0,.1)` (dark `.4`); scrim `rgba(0,0,0,.42)` light, `rgba(0,0,0,.55)` dark.
- Icon sizes: 22 nav/tab, 21 header actions, 19 sheet rows, 17–18 row leading + docked button, 16 field rows, 14–15 inline meta, 12–13 micro meta. Status dots: 6 (meta), 7 (group header/pill), 8–9 (board column, sheet).
- Hit targets: every interactive element is ≥44×44 (icon buttons are 44×44 boxes around smaller glyphs). Swipe action buttons are 64–92 wide × full row height.

### Accessibility

- All text meets 4.5:1 on its own background; status/priority text uses step-11 hues on step-a3 fills, never step 9 as text.
- Status, priority, and unread are all encoded **twice** (colour + word, colour + icon, colour rail + font weight) so the UI survives greyscale and colour-blind use.
- Overdue is stated in words ("Due yesterday", "12 Sep · overdue", "2 overdue"), not implied by red alone.
- Disabled transitions state their reason ("Needs review first") rather than being silently unavailable.
- Every screen keeps the iOS home-indicator area (34px) clear of interactive content; FABs sit 104px from the bottom (above the 84px tab bar).

## Screens / views

Screen ids below match the badge on each canvas option (`3a`…`3n`) — open the HTML and use the ids to find them.

### 3a — My Work (home tab)

**Purpose.** The engineer's landing screen: what needs attention today, across every project.

**Layout.** Vertical flex: status bar (54) → title block (title + subtitle, 16px gutter, 6px top / 10px bottom) → segmented control (36, gutter 16, 12px bottom) → scrollable content on `--panel` → FAB → tab bar (84).

**Content blocks.**
- Title `My Work` 22/26/700. Subtitle `Sunday, 13 September · 7 assigned` 12/16 `--na11`. Right: 44×44 search icon button, then a 36px circular avatar (`AR`, violet fill).
- Segmented: `Focus` (active) / `All assigned` / `Watching`. Track `--na3`, active chip `--n1` + shadow.
- Sections, each a 34px header then rows:
  - **Overdue · 1** — header background `--reda3`, clock icon + label in `--red11`.
  - **Today · 3** — header background `--na2`, label `--na11`.
  - **Next 7 days · 3** — same treatment.
- Row (68px, `--bg`, bottom border `--na3`, 11px gap): leading 17px type icon (`bug` / `sparkles` = FEATURE / `square-check` = TASK / `trending-up` = IMPROVEMENT / `layers` = EPIC / `orbit` = MASTER), coloured `--red11` when the row is overdue else `--na11`; centre column with title (15/19/550, single line, ellipsis) and a meta line (11.5/15) reading `status dot+word · second fact · KEY`, separated by `·` in `--na7`; trailing project chip (22px tall, 6px radius, project-hued a3 fill, 11px/650 text).
- FAB 56×56, radius 18, `--p9`, plus icon 24 — anchored right 18, bottom 104.
- Tab bar: 4 items (My Work `list-todo`, Projects `folder-kanban`, Releases `package`, Inbox `bell`), active in `--p9` with 650 label; Inbox carries a red count badge (17px, `--red9`, 2px `--bg` ring) offset top 4 / left `calc(50% + 5px)`.

**Data.** Grouped query of tasks assigned to the current user across projects, bucketed by `dueDate` relative to today (overdue / today / next 7 days), ordered by priority then due date within a bucket. Rows show the **second fact** by priority of usefulness: priority when urgent/high, otherwise the due date.

### 3b — Project · Task List

**Purpose.** Work a single project's queue; the default view mode per flux-web's `list` fallback.

**Layout.** Status bar → project header row (52) → view segmented (36) → group/filter strip (38, bottom border `--na4`) → grouped scroll area on `--panel` → FAB → tab bar.

**Components.**
- **Project header.** 30px rounded-9 project avatar (`CE` on `--pa3`, text `--pa11`, 11px/700); two-line label — name 16/19/650 and `Editor · 24 open` 11/14 `--na11`; 15px `chevrons-up-down` to signal the switcher; then 44×44 search and 44×44 overflow buttons.
- **View segmented.** `List` (active) / `Board` / `Calendar`, each with a 14px leading icon (`list`, `square-kanban`, `calendar`). Persist per project per flux-web's three-tier preference resolution (project override → account global → `list`).
- **Group/filter strip.** Left: text button `Grouped by status` with `rows-3` + `chevron-down`, 12.5/550 `--na11` — opens a view-options sheet (group by, sort, pill style). Right: `Filters` button, 28px tall, `--pa3` fill, `--pa11` text, with a filled `--p9` count badge showing active filter count. This replaces the previous three-chip row.
- **Group header** (36px): status dot 7px + status word in its step-11 hue at 12/700 + count in `--na10`; background is the status a3 wash (`--ambera2` for In Progress, `--bluea3` for To Do). A lead-only right side can show `WIP limit 5` in the status hue.
- **Task row** (62px): 17px type icon → title 15/19/550 (one line, ellipsis) → meta line `KEY · priority · due` (key in mono `--pa11`; priority as icon+word: `chevrons-up` Urgent `--red11`, `arrow-up` High `--amber11`, `minus` Medium `--na11`, `arrow-down` Low `--na11`) → trailing 28px assignee avatar, or a `user` glyph on `--na4` when unassigned.
- **Swipe state** (shown live on this screen, `CEDTE-49`): the row translates left by 156px revealing two full-height actions flush right — `In Review` 92px wide on `--purple9` with `eye` icon, and `More` 64px on `--n6` with `ellipsis`. Labels are 10.5/650 white (dark text on `--n6`). The row keeps its key and title visible; a `2px 0 8px rgba(0,0,0,.1)` shadow on the sliding face reads as lift. Only the **next status in the project's workflow** is offered, never a generic Done.

**Behaviour.** Tap row → detail. Swipe left → status actions (`ion-item-sliding`, `side="end"`). Swipe right → Archive (destructive tint, requires MANAGER). Pull to refresh. Infinite scroll paginates the same endpoint the web list uses.

### 3c — Project · Board

**Purpose.** Status-column triage with drag between statuses.

**Layout.** Header + segmented as 3b, then a **column rail** (single row of status pills with counts, 11.5/600, active one underlined 2px in its hue, horizontally scrollable, 10px bottom padding, `--na4` bottom border), then the horizontal column area, then tab bar.

**Columns.** 296px wide (≈78% of the 390 viewport so the next column always peeks), 12px gap, 16px left gutter. Column head (not scrolled with cards): 8px dot, name 13/700, count `--na10`, overflow `ellipsis` on the right. Cards: radius 14, `--bg`, `0 0 0 1px var(--na4), 0 1px 2px rgba(0,0,0,.04)`, 12px padding, 10px gap between cards.

**Card anatomy.** Top row — 14px type icon, mono key 11/550 `--pa11`, spacer, priority icon+word 11/650 in its hue. Title 14.5/19/550 with `text-wrap: pretty`. Footer row — up to two chips (release chip on `--violeta3`, label chip on `--na3`), comment/attachment counts (13px icon + number, 11.5 `--na11`), spacer, due date (11.5; `--red11` + `clock` icon when today/overdue), 26px avatar. Column ends with a 44px dashed `--na6` "Add task to <status>" affordance.

**Behaviour.** Horizontal snap-scroll per column; the rail is both indicator and jump control. Long-press a card to pick it up, then drag across the edge to auto-advance columns; drop writes the status transition. Drag is gated on `TASKS:WRITE` + project EDITOR. The adjacent column renders at 50% opacity in the mock only to show the peek — do not ship the opacity.

### 3d — Project · Calendar

**Purpose.** See and reschedule dated work; month grid by default.

**Layout.** Header (52) → view segmented (36) → month toolbar (42) → weekday strip (MON…SUN, 10.5/650 `--na10`, 0.04em) → 7-column grid filling remaining height (`grid-auto-rows: 1fr`, 1px gaps, 8px side padding) → collapsed "Unscheduled" sheet → tab bar.

**Month toolbar.** 36px chevron buttons flanking `September 2026` (15/650), then right-aligned `Today` outline button (30px, radius 8, border `--na5`) and a `Month ▾` scope button (30px, `--na3` fill).

**Day cell.** Date number 11px (`--na10`, `--na8` for out-of-month/weekend), weekend cells washed with `--na1`. Today: `--pa2` background, `inset 0 0 0 1.5px var(--p9)`, and the number becomes a filled 18px `--p9` circle with white 11/700 text. Events are **stripe pills**: 15px tall, radius 3, 3px left border in the status hue, background the matching a3/a2 wash, key text 9.5/600 with 3px left padding, 2–3px stacking gap. Overflow shows `+2 more` 9.5/600 `--na10`. Release dates render as violet stripes (`v2.4.0`).

**Unscheduled sheet.** Collapsed to a 40px handle row on `--surface` with a 36×4 grabber, `inbox` icon, `Unscheduled` 14/600, count badge on `--na4`, and the hint `Drag onto a day` + `chevron-up`. Drag from here onto a day sets `dueDate`; dragging an existing ranged event preserves duration and writes `plannedStartDate`/`plannedEndDate`, matching the web rules. Pill style follows the project's calendar-pill-style preference (`stripe` default).

### 3e — Task detail · Details

**Purpose.** Read the full task and change one field at a time.

**Layout.** Status bar → sticky header block on `--bg` (nav row 48 → title → chip row → tab row 40, bottom border `--na4`) → scroll area on `--panel` with 16px gutter and 10px card gaps → docked action bar → home indicator.

**Header.** Nav row: 44×44 back (`arrow-left`), then type icon 14px + mono key 13.5/650 `--pa11` + 13px `copy` glyph, then 44×44 watch toggle (`bell-ring` filled `--p9` when watching, `bell` `--na11` when not), then 44×44 overflow. Title 19/24/650, −0.02em, `text-wrap: pretty`, up to 3 lines. Chip row: status pill (32px, radius 9, `--ambera3` fill, `--amber11` text, 7px dot, trailing `chevron-down` — the only header control that writes data), then read-only outline chips for priority (with its icon, hue text) and type. Tabs: `Details` / `Comments` (with count badge) / `Activity`, 40px tall, 20px gap, active gets 650 weight, `--n12` text and `inset 0 -2px 0 var(--p9)`.

**Body.**
1. **People pair** — two equal cards, radius 12, `--bg`, 1px `--na4`: uppercase label 11/650 `--na10`, then 24px avatar + name 13.5/550.
2. **Field card** — four 46px rows divided by `--na3`, each: 16px icon `--na10`, label 13 `--na11`, spacer, value right-aligned, 15px `chevron-right` `--na8`. Rows: Due date (`calendar`, value `12 Sep · overdue` 13.5/650 `--red11`), Release (`package`, violet chip), Parent (`layers`, mono key + truncated title), Labels (`tag`, up to two `--na3` chips, then `+n`).
3. **Description card** — uppercase label + `pencil` affordance; body 13.5/21; `Show more` 13/600 `--pa11` when clamped past ~6 lines.
4. **Attachments row** — 46px card row with count and chevron.

Subtasks are **absent by design**: this is a leaf type (BUG), and the web rules only expose "Add subtask" on container types (MASTER/EPIC). Render the subtasks card only for containers.

**Docked action bar.** 10px top padding, 16px gutter: 48×48 outline icon button (`message-circle`, jumps to the Comments tab with the composer focused) + flexible 48px primary button, radius 13, `--p9`, white 15/650, `eye` icon + **the next status name** (`Move to In Review`). The label is computed from the project workflow, never hardcoded. Read-only roles (VIEWER) lose the bar entirely; COMMENTER keeps only the comment button.

### 3f — Task detail · Comments

Same shell, tab `Comments` active. On scroll the header collapses: the title row becomes a two-line condensed block (mono key + inline status pill on line 1, truncated title 13/17/550 on line 2) with a `0 1px 8px rgba(0,0,0,.05)` lift.

**Thread.** 16px gutter, 14px between comments. Each: 30px avatar; name 13/650 + role/time 11.5 `--na10`; bubble radius 12 with the **top-left corner at 4px**, `--bg`, 1px `--na4`, 10/12 padding, text 13.5/20. Own comments use `--pa2` fill with `--pa4` border. Mentions render as `--pa11` 600. Inline code: CommitMono 12.5 on `--na3`, radius 4, 1px 4px padding. Reactions: 26px pills — existing reaction `--pa3`/`--pa11` 12/600, plus a 26px outline `smile-plus` add button. Attachment references show as a 12/550 `--na11` row with a 13px `paperclip`. A live "X is typing…" line sits indented 40px with an 8px `--na6` dot.

**Composer (docked).** `--bg`, top border `--na4`, `0 -4px 20px rgba(0,0,0,.06)`: a min-44px field, radius 14, `--n2` fill, 1px `--na5`, placeholder `Write a comment…` 14 `--na9`, with 32px `at-sign` and `paperclip` buttons inside on the right; then a 44×44 send button, radius 14, `--pa4` fill, `--pa11` `send` glyph (becomes solid `--p9` + white when the field is non-empty). The composer must sit above the keyboard (Capacitor keyboard resize) and above the 34px safe area.

### 3g — Task detail · Activity

Same shell, `Activity` active. Day-grouped: a 36px uppercase day header (`Today`, `Friday 11 September`; later groups carry a `--na4` top border), then entries in a 12px-gap two-column timeline — a 26px circular badge tinted by the change type (status `--ambera3`/`circle-dot`, assignment `--na3`/`user`, release `--violeta3`/`package`, priority `--reda3`/`chevrons-up`, attachment `--na3`/`paperclip`, creation `--greena3`/`plus`) with a 1.5px `--na4` connector below it, and a text column (13.5/19) reading `<b>Actor</b> verb <old chip> → <new chip>` with the time 11.5 `--na10` underneath. Value chips are the same 20px status pills used everywhere (`arrow-right` 12px as the transition arrow). The docked action bar stays.

### 3h — Status sheet

Triggered by the status pill, the swipe `In Review` action, or the board's column menu. Scrim `rgba(0,0,0,.42)` over the dimmed detail; sheet on `--bg`, radius 22 top, `0 -12px 40px rgba(0,0,0,.28)`, 36×4 `--na6` grabber.

Header: `Move task` 16/700 and `CEDTE-49 · Checkout Platform workflow` 12.5 `--na11`. Then statuses **grouped by category** (`To do`, `In progress`, `Done`) with 11/700 uppercase `--na10` group labels and 52px rows (9px dot + name 15/550, `--na3` top borders):

- **Current** row: category wash background, name in the status hue at 650, `current` 12 `--na10`, trailing `check`.
- **Suggested next**: trailing `--pa3`/`--pa11` pill `Suggested next` — the workflow's canonical forward transition (also the docked button's label).
- **Blocked**: dot at 45% opacity, name `--na8`, trailing `lock` icon + reason (`Needs review first`). Never hide illegal transitions; state why.
- **Done**: trailing `Resolution required` + chevron — selecting it expands a resolution picker inline in the same sheet (Fixed / Won't do / Duplicate / Cannot reproduce) rather than opening a second dialog. `isClosed` statuses cannot be committed without a resolution.

Footer: 48px outline `Cancel`, then the 34px home indicator. Sheet height is content-driven; make it a `breakpoints: [0, 1]` modal, dismissible by drag.

### 3i — Create task (sheet)

Full-height sheet over a dimmed app (status bar goes dark: `--n12` background, white glyphs). Sheet corners 22.

- **Sheet nav** (52, bottom border `--na4`): `Cancel` 15/550 `--na11` · centred `New task` 16/700 · `Create` 34px pill `--p9`/white 14/650. `Create` is enabled as soon as the title is non-empty.
- **Context row** (52): 26px project avatar + name 14.5/600 + `chevrons-up-down`; right, a type select chip (32px, outline `--na5`, type icon + `Bug` + chevron). These come first because they constrain the rest (allowed statuses, allowed parents, required fields).
- **Title** — 17/24/600, −0.01em, with a 2px `--p9` caret; helper `Required · 38 characters` 11.5 `--na10`.
- **Description** — placeholder `Add a description, steps to reproduce, or paste a log…` 14/21 `--na9`, bottom border `--na3`.
- **Optional chips** (36px, 8px gap, wrapping): filled when set (assignee chip carries a 22px avatar on `--pa3`; priority chip `--reda3`/`--red11` with its icon), dashed `--na6` outline when unset (`Due date`, `Release`, `Labels`, `Parent`). Tapping expands the picker in place.
- **Rule callout** — `--bluea3` card, radius 12, `info` icon + 12.5/17 `--blue11`: `New bugs start in To Do and notify the project lead.` Surface the actual default-status and assignment rules from project config here.
- **Keep open toggle** — 44×26 switch + `Keep the sheet open to add another`.
- **Keyboard accessory bar** (48, `--n2`, top border `--na4`): `paperclip`, `camera`, `at-sign`, `mic` at 20px 18px apart, plus a right-aligned `Done` 13/600 `--pa11`.

Parent pickers list **container types only** (MASTER/EPIC), mirroring `INVALID_PARENT_TYPE`.

### 3j — Project switcher (sheet)

Scrim `rgba(0,0,0,.45)`; sheet inset 120px from the top, radius 22, `--bg`. Grabber, then a row with `Switch project` 16/700 and `Done` 13.5/600 `--pa11`. Search field: 40px, radius 11, `--n3` fill, `search` icon + `Search 12 projects` 14 `--na9`.

Groups: `Pinned` (30px header with a 12px `pin` icon) then `All projects` (34px header on `--na2`). Rows are 64px, 12px gap: 38px rounded-11 project avatar (project-hued, white 13/700 initials), name 15/650, sub-line 11.5 `--na11` stating **role · open count · overdue count** (`Editor · 24 open · 2 overdue`). The current project row is washed `--pa2` with a trailing 19px `circle-check` in `--p9`. Read-only projects say `Viewer · read-only` and carry a trailing `lock` — role is shown up front because it decides what the next screen permits.

### 3k — Releases (tab)

Title block (`Releases` 22/26/700, `Checkout Platform · 4 active`) + 44px search button; then a filter chip row (`Active` selected on `--pa3`/`--pa11`, `Planned`, `Released` outline `--na4`), then cards on `--panel` (16px gutter, 12px gaps), FAB, tab bar.

**Release card** (radius 14, `--bg`, 14px padding): status pill top-left (24px, radius 7, hue a3 fill + hue 11 text, 11.5/700, with `loader` / `calendar` / `rocket` icon) and a right-aligned date or countdown — `Ships in 10 days` turns `--red11` 600 when at-risk. Then version mono 15/700 + name 15/600 on one baseline. Then the progress row: 8px full-width track on `--na4`, fill in `--green9` (blue while planned) with 99 radius, and a right-aligned percentage 12/650 `--na11`. Then counts 11.5 `--na11` with numbers in 700 `--n12` (`18 done`, `11 open`), an `2 overdue` callout in `--red11` 650 when non-zero, spacer, and an overlapping avatar stack (22px, 2px `--bg` ring, −7px margin, `+4` overflow chip on `--na4`).

Shipped releases drop the progress bar and state the outcome instead (`Shipped on time`, `check-check` in `--green11`), at 85% opacity. Footer: `Show 9 earlier releases` 13/600 `--pa11` with a `history` icon.

### 3l — Inbox (tab)

Title block (`Inbox`, `3 unread · 2 mentions`) + a `Mark all read` outline button (34px, `check-check` icon, 12.5/600). Segmented: `All` / `Mentions` (with a red count badge) / `Assigned` — mentions are separated because they need a reply; the rest are state changes you only need to notice.

Groups `Today` / `Earlier` as 32px uppercase headers on `--na2`. Rows: 12/16 padding, 11px gap, `--bg`, bottom border `--na3`. **Unread rows carry a 3px `--p9` left rail and 700-weight leading text**; read rows have no rail and 600 weight. Leading element is either a 32px user avatar (for comments/mentions) or a 32px tinted glyph circle typed by event (`circle-dot` on `--ambera3` for assignment, `package` on `--violeta3` for release scope, `check` on `--greena3` for closure). Text column: actor 13.5/700 + verb 12 `--na11` + right-aligned relative time 11.5 `--na10`; body 13.5/19 with mentions in `--pa11` 600; a context line for mentions showing mono key + project 11.5 `--na11`. Footer hint: `Swipe a notification to mark read or mute the task`.

### 3m — My Work, dark

Identical structure to 3a with the dark token tier. Differences that matter: rows sit on `--surface` `#212225` over `--panel` `#18191B` (elevation lightens); status words use step-11 dark hues; the To Do dot switches to `--blue11` `#70B8FF` for visibility on dark; the segmented active chip is `--n5` with a heavier shadow; the tab bar sits on `--panel` and the active item uses `--p11`; the FAB drops its indigo glow for `0 10px 24px rgba(0,0,0,.5)`; the overdue band keeps `--reda3` at dark alpha — it desaturates rather than intensifying.

### 3n — Task detail, dark + overflow sheet

Shows the destructive path. Sheet on `--surface`, scrim `rgba(0,0,0,.55)`, 54px rows divided by `--na4`: `Reassign` (with current assignee right-aligned), `Change parent`, `Copy link`, `Stop watching`, `Archive`. Then an 8px `--panel` spacer band, then `Delete task` in `--red11` 600 with `trash-2` and a right-aligned consequence note `and 4 comments`. Destructive last, separated, and labelled with what it removes; it still requires a confirm alert naming the key. Footer: 48px `Cancel` on `--n4`.

## Ionic component mapping

Use the primitive and restyle it with its CSS custom properties; only drop to plain markup where noted. Nothing here needs a custom gesture implementation except the board's cross-column drag.

### Shell

| Design element | Ionic | Notes |
|---|---|---|
| Bottom tab bar (84px, 4 items, badge) | `ion-tabs` + `ion-tab-bar slot="bottom"` + `ion-tab-button` with `ion-icon` / `ion-label` / `ion-badge` | `--background: var(--bg)`, `--color-selected: var(--p9)`. Label 10px/650 via `ion-tab-button ion-label`. Badge → `ion-badge color="danger"`. Safe area handled by Ionic. |
| Status bar | Capacitor `StatusBar` | Prototype draws it; the app gets it free. `style: Light`/`Dark`, `overlaysWebView: false`. Create/switcher sheets set `Style.Dark`. |
| Screen header (title block, project row, nav row) | `ion-header class="ion-no-border"` + `ion-toolbar` | Use `ion-buttons slot="start|end"` with `ion-button` (`--padding: 0`, 44×44) for icon buttons. Large titles are custom markup in the toolbar, **not** `ion-title size="large"` — the design's title block carries a subtitle. |
| Collapse-on-scroll header (3f/3g) | `ion-header collapse="condense"` pattern, or `ion-content scrollEvents` + a class toggle | The condensed state is the two-line key+title block. |
| Scroll area | `ion-content` (`--background: var(--panel)`) | `fullscreen="true"` only where content must run under the header. |
| Pull to refresh | `ion-refresher` + `ion-refresher-content` | My Work, list, board, releases, inbox. |
| Pagination | `ion-infinite-scroll` + `ion-infinite-scroll-content` | List, comments, activity, inbox. |
| Loading skeletons | `ion-skeleton-text animated` inside the real row markup | Match the row heights in this doc. |
| Tablet split (≥768px) | `ion-split-pane` | List + detail. |

### Lists and rows

| Design element | Ionic | Notes |
|---|---|---|
| Task row (3a 68px, 3b 62px) | `ion-item button detail="false"` inside `ion-list lines="full"` | `--min-height` (not height), `--background: var(--bg)`, `--border-color: var(--na3)`, `--padding-start: 16px`, `--inner-padding-end: 16px`. Leading type icon in `slot="start"`, avatar in `slot="end"`. Title/meta as a custom two-line div — `ion-label` text-wrap defaults fight the ellipsis rules. |
| Status group header (34–36px) | `ion-item-group` + `ion-item-divider sticky` | `--background` = the status a3 wash, `--color` = status 11 hue. Sticky gives the scroll behaviour the design implies. |
| Swipe actions | `ion-item-sliding` + `ion-item-options side="end"` (status + More) and `side="start"` (Archive) | `ion-item-option` with `--background` = status 9 hue; 92px / 64px widths via `--padding-start/end` on the option. Use `ion-item-sliding.open()` for the onboarding demo state. |
| Section headers in sheets / My Work buckets | `ion-item-divider` or plain div | Plain div is fine where it isn't sticky. |
| Field rows in task detail (46px, label → value → chevron) | `ion-item button detail="true"` | `--detail-icon-color: var(--na8)`, `--detail-icon-opacity: 1`. Value in `slot="end"` as `ion-note` (`--color: var(--na11)`) or a chip. |
| Metadata chips (status, priority, label, release) | `ion-chip` (outline where dashed) or plain span | `ion-chip` for tappable ones (it gives ripple + 32px height); plain span for read-only pills under 26px — `ion-chip`'s min height fights the 20–24px badges. |
| Avatars | `ion-avatar` (32px+) or plain span | Overlapping stacks (releases) are plain spans with negative margins. |
| Counts / badges | `ion-badge` | Filter count, comment count, inbox count. |
| Progress bar (releases) | `ion-progress-bar` | `--progress-background: var(--green9)`, `--background: var(--na4)`, `height: 8px`, `border-radius: 99px`. |

### Controls, sheets, feedback

| Design element | Ionic | Notes |
|---|---|---|
| View switcher (List/Board/Calendar), Focus/All/Watching, Inbox filters | `ion-segment` + `ion-segment-button` | `--background: var(--na3)`, `--background-checked: var(--n1)` (dark `--n5)`, `--indicator-box-shadow: 0 1px 2px rgba(0,0,0,.1)`, `--border-radius: 9px`, 36px height. Icon + label inside the button. |
| Primary docked button (`Move to In Review`) | `ion-footer class="ion-no-border"` + `ion-button expand="block"` | Footer gets the `0 -4px 20px rgba(0,0,0,.06)` shadow and the safe-area padding (`ion-padding` + `env(safe-area-inset-bottom)`). Button `--background: var(--p9)`, `--border-radius: 13px`, `height: 48px`. |
| FAB | `ion-fab vertical="bottom" horizontal="end"` + `ion-fab-button` | `--border-radius: 18px` for the squircle, `--background: var(--p9)`, `--box-shadow` per tokens. Offset so it clears the 84px tab bar (bottom 104px equivalent). |
| Status sheet (3h), overflow sheet (3n), project switcher (3j), view options | `ion-modal` with `breakpoints: [0, 1]`, `initialBreakpoint: 1`, `handle: true` | **Not** `ion-action-sheet` — the rows need dots, pills, reasons, and trailing notes that the action-sheet API can't express. `--border-radius: 22px`, `--backdrop-opacity: .42` (dark `.55`). Switcher: `initialBreakpoint` sized so the sheet starts 120px from the top. |
| Unscheduled drawer (3d) | `ion-modal` with `breakpoints: [0.08, 0.5, 1]`, `backdropBreakpoint: 0.5`, `backdropDismiss: false` | Collapsed handle row is the 0.08 stop; the app stays interactive behind it. |
| Create task (3i) | `ion-modal` (full-screen, `presentingElement` for the card effect) | Title `ion-input` (`autofocus`), description `ion-textarea autoGrow`, `Keep the sheet open` `ion-toggle`, chips as `ion-chip`. Nav row is an `ion-toolbar` with `ion-buttons`. |
| Keyboard accessory bar (3i) | `ion-footer` + Capacitor `Keyboard` (`setAccessoryBarVisible(false)`, `resize: 'body'`) | Render your own bar so the icons match; hide the native one. |
| Comment composer (3f) | `ion-footer` + `ion-textarea autoGrow rows="1"` + send `ion-button` | Keep it above the keyboard with `Keyboard` resize mode `native`/`body`; test on Android where `ion-footer` needs `keyboardAttach`-style handling. |
| Search fields | `ion-searchbar` | `--background: var(--n3)`, `--border-radius: 11px`, `--box-shadow: none`, 40px. Header search icons are `ion-button`s that push a search page. |
| Due-date picker | `ion-datetime presentation="date"` inside an `ion-modal` | Honour the project's date format. |
| Assignee / label / release / parent pickers | `ion-modal` sheet with `ion-searchbar` + `ion-list` | Same row anatomy as the project switcher. Parent picker lists container types only. |
| Undo toast | `ion-toast` with `buttons: [{text:'Undo'}]`, `duration: 4000`, `position: 'bottom'` | Offset above the tab bar. |
| Destructive confirm | `ion-alert` | Name the task key in the message; `role: 'destructive'` on the confirm button. |
| Offline banner | Plain div under the header + Capacitor `Network` | `--ambera3` background, 28px. |
| Haptics on swipe commit | Capacitor `Haptics` (`impact` light on reveal, medium on commit) | |

### Board (3c) — the one custom piece

`ion-content` with a horizontally snap-scrolling flex row of columns (`scroll-snap-type: x mandatory`, columns `scroll-snap-align: start`, 296px). Cards are plain divs (not `ion-card` — its default margins/shadows fight the 12px gap and 14px radius). Cross-column drag: long-press pickup + pointer events, with edge auto-advance of the snap scroller; `ion-reorder-group` only handles vertical reordering within a list and is not sufficient. Gate on `TASKS:WRITE` + project EDITOR. The column rail above is an `ion-segment` in `scrollable` mode.

### Theming

Map the token table onto Ionic's stepped variables once, globally, rather than per-component: `--ion-background-color` ← `--bg`, `--ion-text-color` ← `--n12`, `--ion-color-primary` ← `--p9` (with its contrast/shade/tint), `--ion-color-step-*` from the gray scale, `--ion-item-background` ← `--bg`, `--ion-border-color` ← `--na3`. Dark mode via `@media (prefers-color-scheme: dark)` plus a manual override honouring the user's profile theme preference. Set `mode: 'ios'` app-wide so sheet, segment, and item geometry match these mocks on both platforms.

## Interactions & behaviour

- **Navigation.** Four bottom tabs, each its own stack. Task detail pushes onto the current tab and keeps its own back stack; the project switcher never changes tabs. Back gesture pops; a task opened from Inbox or My Work returns there, not to the project.
- **Swipe (list rows).** `ion-item-sliding`, end side: primary = next workflow status (92px, status hue), secondary = More (64px, `--n6`). Start side: Archive, MANAGER-only. Threshold ~40% of the row; past ~70% the primary action commits on release. Haptic light impact on reveal, medium on commit.
- **Optimistic writes.** Status changes, assignment, and mark-read apply immediately with the row/pill in its new state, plus a 4s toast offering `Undo`. On failure, revert and show the server message (the backend is authoritative on parent/cycle/depth and resolution rules).
- **Sheets.** Ionic modals with `breakpoints: [0, 1]` (or `[0, 0.5, 1]` for the unscheduled drawer), drag-to-dismiss, scrim tap closes. All destructive confirmations are `ion-alert` naming the task key.
- **Motion.** Sheet in 280ms `cubic-bezier(.32,.72,0,1)`, out 220ms. Swipe follows the finger 1:1 and settles in 180ms ease-out. Status pill and row status-hue crossfade 150ms. Tab switch has no transition. Skeletons fade in after 200ms of pending time, not before.
- **Loading.** List and board show 6 skeleton rows/3 skeleton cards using `--na3` blocks at the real row heights. Detail shows the header populated from the list row (key, title, status) while the body skeletons in — no full-screen spinner.
- **Empty states.** One sentence plus one action: list (`No tasks match these filters` + `Clear filters`), board column (dashed `Add task to <status>`), inbox (`You're all caught up`), unscheduled (`Everything is scheduled`), comments (`No comments yet` + composer focused).
- **Offline.** Capacitor Network offline shows a 28px `--ambera3` banner under the header (`Offline · showing cached work`, `cloud-off` icon); writes queue and the affected row gets a small `refresh-cw` glyph until synced.
- **Pull to refresh** on My Work, list, board, releases, inbox.
- **Permissions.** VIEWER: no FAB, no swipe actions, no docked primary, fields not tappable. COMMENTER: composer and reactions only. EDITOR: create/edit tasks and releases. LEAD: sprint/release management, WIP hints. MANAGER: archive/delete, project settings. Account status banners (SUSPENDED / LOCKED / PENDING_VERIFICATION) render above the header and disable actions as on the web.
- **Responsive.** Designed at 390×844. Text scales with OS Dynamic Type up to ~120% — row heights must grow rather than clip (the fixed heights above are minimums; use min-height). At ≥768px (tablet) the list and detail become a two-pane split and the board shows two full columns.

## State management

Mirror the web app's services rather than inventing new state:

- **Session** — account, org role, project roles map, account status, JWT system role.
- **View preferences** — per-project view mode, group-by, filter layout, calendar pill style; resolved project override → account global → fallback (`list`, `status`, `topbar`, `stripe`). Cache in Preferences (Capacitor) primed at sign-in, write through to the backend.
- **Task query state** — projectId, view mode, group-by, filters (status, assignee, priority, label, release, due window), sort, page. The calendar's visible window drives `dueDateFrom`/`dueDateTo` and re-fetches on any navigation.
- **Task detail** — task, comments page, activity page, watching flag, active tab, pending optimistic mutations.
- **Create sheet** — draft (project, type, title, description, assignee, due, priority, labels, parent), validity = non-empty title, `keepOpen` flag.
- **Inbox** — notifications page, unread count (also drives the tab badge and app badge), filter (all / mentions / assigned).
- **Workflow** — per-project status list with categories and the suggested-next mapping; needed by the swipe action, the docked button label, and the status sheet.

## Assets

- `assets/icons.js` + `assets/icons.json` — the icon set used by every screen, as SVG path data keyed by name (Lucide-style 24×24, `stroke-width` 2, `stroke: currentColor`, no fill). In the prototype they are injected as `<symbol id="i-<name>">` and referenced via `<use href="#i-name">`. In the app, use flux-web's existing icon pipeline (or `ion-icon` with these as custom SVGs). Names used: `list-todo folder-kanban package bell bell-ring bell-off search plus minus check check-check circle-check circle-dot clock calendar chevron-left chevron-right chevron-down chevron-up chevrons-up chevrons-up-down arrow-left arrow-right arrow-up arrow-down arrow-up-down bug sparkles square-check trending-up layers orbit user users tag paperclip camera mic at-sign send message-circle smile-plus eye lock info archive trash-2 copy pencil link history rocket loader inbox pin sliders-horizontal rows-3 list square-kanban ellipsis ellipsis-vertical wifi cloud-off refresh-cw`.
- `assets/fonts/InterVariable.woff2`, `assets/fonts/CommitMonoVariable.woff2` — bundle both with the app; the mono face is only for keys, versions, and inline code.
- `assets/flux-logo.svg`, `assets/flux-icon.svg` — existing brand marks, for the launch/auth screens (not used in these 14 screens).
- No photography or illustration is used anywhere in the design.

## Files

| File | What it is |
|---|---|
| `Flux Mobile v2.dc.html` | **The design.** All 14 screens (`3a`–`3n`) on one canvas, light and dark. Open in a browser. |
| `support.js` | Runtime needed only to render the HTML reference. Not part of the deliverable. |
| `assets/icons.js`, `assets/icons.json` | Icon set (see Assets). |
| `assets/fonts/*.woff2` | Inter + CommitMono variable fonts. |
| `assets/flux-logo.svg`, `assets/flux-icon.svg` | Brand marks. |
| `reference/Flux Web Current.dc.html` | The **existing web** screens this mobile app parallels — use for label, enum, and data parity. |

An earlier exploration round (14 alternative list/detail/board directions, ids `1a`–`1k`, plus the chosen combination `2a`–`2d`) lives in the project's `Flux Mobile.dc.html`. It is not needed to implement this design; ask if you want it for context on what was rejected.

## Open questions for the product owner

1. Does Releases earn a permanent bottom-tab slot, or should it live inside the project alongside List/Board/Calendar (freeing the tab for Search or Profile)?
2. Do read-only stakeholders get this same My Work home, or a digest view (release health + recently closed) instead?
3. Should the swipe-left secondary (`More`) open the full status sheet, or a compact assign/snooze/watch menu?
