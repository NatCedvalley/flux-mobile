# CLAUDE.md

## 1. What this repo is

Flux Mobile is the iOS/Android companion app to the Flux task manager at
justflux.asia. It is a fresh, standalone repo — **not** part of the Angular
web frontend or the Spring Boot backend repos. It talks to the same backend
over HTTP once that integration is built.

## 2. Stack

- **Ionic 9** + **Angular 22** + **Capacitor 8**
- Angular standalone components and signals — no NgModules
- Zoneless (no zone.js; components default to `OnPush`)
- Targets iOS and Android
- Package manager: **npm**
- Tests: **Vitest** (via `@angular/build:unit-test`, coverage via
  `@vitest/coverage-v8`), lint: **ESLint** via `angular-eslint`, format:
  **Prettier**. The test target sets `"isolate": true`: the builder
  defaults to sharing loaded modules between spec files, so a spec's
  `vi.mock` of a plugin could arrive after another spec had already loaded
  the real one (seen in `app-lock.service.spec.ts`). It roughly doubles
  the suite's time, still under 30 s.
- A husky pre-commit hook runs `lint-staged` (ESLint `--fix` then Prettier)
  on staged files and blocks the commit if either fails

Bundle identifier / app name: `asia.justflux.mobile` / **Flux** (set in
`capacitor.config.ts` and mirrored into `android/` and `ios/` by `cap sync`).

## 3. Folder conventions

```
src/
├── core/     framework-agnostic TypeScript. No Angular/Ionic/Capacitor/rxjs
│             imports — enforced by eslint.config.js. This is the layer that
│             would survive a future Flutter or native UI rewrite unchanged.
├── theme/    design tokens (tokens.scss), the CSS variables derived from
│             them (variables.scss), and the bundled fonts (fonts/,
│             typography.scss). See §7.
└── app/      Angular/Ionic UI only: pages, routes, the handoff icon set
              (icons/), shared list components (shared/), the project
              switcher, on-device project preferences and the cached
              project list with the caller's roles (projects/), the
              create sheet and its button (task-create/), attachment
              upload, opening and the file sources (attachments/), the
              project board and its drag (board/), the project calendar
              and its Unscheduled drawer (calendar/), push, opening
              one and the Inbox's permission card (push/), the Inbox's unread
              counts and its row (inbox/), the connection state, the
              offline banner and toasts, the read cache's wipe, the
              write queue, its replay and the pending changes sheet
              (offline/), the theme choice (theme/), the OS text size
              (text-scale/), the Notifications
              settings page (pages/notification-settings/), the About
              page (pages/about/), and the providers that bridge into
              src/core
```

- Import `src/core` code only via the `@core/*` path alias
  (`tsconfig.json`), never with a relative `../core/...` path — this is also
  eslint-enforced from `src/app`.
- The bridges between `src/app` and `src/core` are five injection tokens
  in `src/app/providers/`, all provided in `src/main.ts`: `FLUX_API`
  (`flux-api.token.ts`) and `NETWORK_FLUX_API`
  (`network-flux-api.token.ts`, the same without its cache, see
  [§4](#4-api-layer)), `TOKEN_STORE` (`token-store.token.ts`, see
  [§4 Authentication](#authentication)), and `CACHE_STORE`
  (`cache-store.token.ts`) and `WRITE_QUEUE_STORE`
  (`write-queue-store.token.ts`, in memory unless provided), see
  [Offline](#offline). Everything else in `src/core` is
  plain data, interfaces and classes that take their dependencies as
  constructor arguments.
- Business logic and API types belong in `src/core`. Angular services,
  components, and anything using signals/DI/RxJS belong in `src/app`.

### Navigation

`src/app/tabs/tabs.routes.ts` defines three tabs, each its own stack:
**My Work** (`/tabs/my-work`, the default), **Projects** (`/tabs/projects`)
and **Inbox** (`/tabs/inbox`). The design has no Settings tab: Settings is
pushed onto the My Work stack (`/tabs/my-work/settings`) from the avatar
button. It opens with a read-only profile header (the avatar's fill and
initials, from `accountAvatar()` in `src/core/people/`, then the name, email
and timezone, each left out when the account lacks it); editing stays on the
web. Its Theme row opens the shared picker sheet with System, Light and Dark
(see [§7](#7-theme)). Its About row pushes `/tabs/my-work/settings/about`: version, the native
build number (`App.getInfo().build`, hidden on web), commit, environment and
a Privacy policy row that opens `privacyPolicyUrl` with `@capacitor/browser`
on native or a new tab on web. The Inbox page lives in `src/app/pages/notifications/` (its route
and file names predate the tab). Task detail is routed under every tab as
`tasks/:projectId/:taskId` (tasks are project-scoped), so it pushes onto the
tab it was opened from and back returns there; its route `data.backHref` is
the fallback for a deep link. Link to it relative to the current tab
(`['tasks', task.projectId, task.id]`), never with an absolute
`/tabs/<tab>/...` path, or the task opens in the wrong stack. The two search
pages (`/tabs/my-work/search`, `/tabs/projects/search`) register their own
`search/tasks/:projectId/:taskId` route (`taskDetail(tab, 'search/')`), so
the same relative link opens detail over the results and back returns to
them.

The app runs in Ionic's `ios` mode on both platforms
(`provideIonicAngular({ mode: 'ios' })`), which the design requires and
which gives every stack iOS swipe-back. Android's Back gesture or button is
handled by `BackButtonService` (`src/app/back-button/`, started from an app
initializer): it pops the current tab's stack through `NavController.pop()`,
and calls `App.exitApp()` when there is nothing to pop (a tab's first screen,
or the login page). Ionic's own handler only pops, so without it Back did
nothing on a tab root. It runs at priority 1, so open alerts and sheets
(100) still close first.

Android draws the app under its navigation bar, and some phones (MIUI on
Android 10) report a 0 bottom inset while the gesture pill covers the tab
bar. `global.scss` therefore keeps `--ion-safe-area-bottom` at least
`--flux-android-min-bottom-inset` (16px) on Android; larger real insets still
win. The same Redmi reports 0 with MIUI's button navigation too, where the
47dp bar then covers the tab bar's labels (FM-60).
Releases (handoff screen 3k) has no tab.

### My Work

My Work (handoff 3a) has three segments, each one `GET /dashboard/my-tasks`
query of open tasks (one page of 100, `myWorkQueries()` in
`src/core/my-work/`). **Focus** asks for those assigned
and due by today + 7 days, and `focusBuckets()` (`src/core/my-work/`) splits
them into Overdue, Today and Next 7 days. **All assigned** has no due window
and also gives the subtitle's count. **Watching** loads the first time it's
opened. Rows keep the server's order (priority, then due date). Due dates
are date-only strings compared with the device's local day, never parsed
as UTC. The row's second fact is the priority when it is CRITICAL (shown as
"Critical") or HIGH, otherwise the due date; the status dot's hue comes from
`statusCategory`, not the project's `statusColor`, so it stays on the tokens.

`src/app/shared/` holds the pieces other lists reuse: `app-task-row`, and
the list states `app-skeleton-rows` (fades in after 200 ms of loading, by a
CSS animation delay), `app-empty-state` and `app-error-state` (Retry; says
"Couldn't reach Flux" for an `ApiError` with status 0). Pull-to-refresh
reloads the visible segment and keeps its rows on screen meanwhile.

The header's search icon opens My Work search
(`src/app/pages/my-work-search/`): `GET /dashboard/my-tasks` for assigned
tasks in every project, done ones included (`openOnly=false`), by title or
key (`search`, sent 300 ms after typing pauses), paged 50 at a time with
`PagedList` (`src/core/task-filters/`). Its Filters sheet picks one project,
that project's statuses and priorities (FM-5's "filter by project" lives
here, since the home screen has no filter chrome). Statuses wait for a
project: my-tasks matches a status slug in every project, and slugs are
per project. With filters set, results show before anything is typed.

### Projects

The Projects tab (handoff 3b, `src/app/pages/projects/`) lists one
project's tasks in groups under sticky headers. Its header opens the
switcher sheet (3j, `src/app/projects/project-switcher/`, in an inline
`ion-modal`), which lists `GET /projects/mine` (sent with the device's `tz`,
so overdue counts match the local day) as Pinned, then All projects. Swiping
a row pins or unpins it, and so does the row's pin button (`aria-pressed`,
ours: 3j has only the swipe, which screen readers can't reach). The backend has no pinning, so the pins and the
last project opened live on the device in `@capacitor/preferences`
(`ProjectPrefsService`, keys `projects.pinned` and `projects.last`). The tab
reopens the last project, else the first pinned one, else the first listed.

Grouping follows flux-web's three tiers (`resolveGroupBy()`,
`src/core/project-list/`): the project's `groupBy` from
`GET /projects/{id}/task-view-settings`, then the account's
`defaultGroupBy`, then status. `none`, `priority` and `type` work too.
AI-drafted candidates (label `ai:candidate`) are hidden unless the
project's `aiTaskFilter` says otherwise, as on the web. Status groups follow
the project's `categoryPositions`, then each status's `position`. Their
names and hues come from `GET /projects/{id}/workflow-statuses`, fetched
once per project per session, because a task only carries its status slug.
A status colour the theme has no hue for (pink, orange, teal) falls back to
its category's hue.

The server can't sort tasks by status, so `GroupedTaskPager` pages each
group as its own filtered query (`status=<slug>`, 50 rows, `createdAt,desc`).
On open it fetches the first page of every group at once, which also gives
each header its count and hides empty groups. `ion-infinite-scroll` then
pages the first group that isn't complete yet, and a later group is only
shown once every group above it is complete. Rows are `app-project-task-row`
(key, priority, due date and the assignee's avatar).

A List/Board/Calendar segment sits under the header. The view resolves
like the group-by (`resolveViewMode()`): the project's `viewMode`, then the
account's `defaultView`, then the list. The values are flux-web's lowercase
`list`, `board` and `calendar`. A tap saves the project's override with `PUT {viewMode}` without waiting,
and only a tap does: flux-web also re-saves it on every load.

The strip under the header has two buttons, each opening a bottom sheet
(an inline `ion-modal` with the global `flux-sheet` class, never an
`ion-action-sheet`):

- **Group-by** ("Grouped by status") opens view options
  (`src/app/projects/view-options-sheet/`): group-by and sort. A group-by
  picked here is saved as the project's override with
  `PUT /projects/{id}/task-view-settings` (per user, as flux-web does), and
  the list doesn't wait for the save. The sort (`SORT_OPTIONS` in
  `@core/task-filters`, from the server's whitelist) is kept for the session
  across projects and not saved, matching the web. `GroupedTaskPager` sends
  `createdAt,desc` unless the base query has a `sort`.
- **Filters** (`src/app/projects/task-filter-sheet/`, badge = how many of
  status, priority and assignee are in use) filters by status, priority and
  assignee (`GET /projects/{id}/members/assignable`, fetched when the sheet
  first opens, the caller first as "Me"). The server takes each as a comma
  list (OR within a filter, AND across them). There is no "Unassigned":
  `assigneeId` only takes UUIDs. The sheet edits a draft that applies when
  it closes, however it was closed, so the list refetches once. Filters
  reset when the project changes. A filter on the grouped field narrows
  the groups instead (`filteredGroups()`), because each group's own
  `status=`/`priority=` would override it. When nothing matches, the list
  says "No tasks match these filters" with Clear filters.

The header's search icon opens project search
(`src/app/pages/project-search/`, `?project=<id>&sort=<sort>`): a flat
list of that project's tasks by title or key, in the list's sort and with
its AI filter but not its filters.

**Swipe actions** (EDITOR+; `ion-item-sliding` is disabled below that).
The page wraps each row, so project search rows don't swipe.

- The end side has the row's next status (`nextStatus()`, in its hue,
  `expandable`, so a full swipe commits) and More, which opens the status
  sheet. Ionic's full swipe commits about 30px past the buttons (about half
  the row), not the handoff's 70%.
- The start side has Archive, shown for DONE-category tasks only.
- A light haptic plays when the buttons are fully revealed, and a medium
  one on commit (`src/app/task-status/haptics.ts`, native only).
- A change moves the row with `GroupedTaskPager.placeTask()` rather than a
  refetch. Taking a row out of a group still paging can make the next page
  skip a row until the list reloads.
- A change made on task detail moves the row too (`TaskChangesService`),
  if it's loaded. A task archived or deleted there drops its row; one
  restored by Undo there comes back only when the list reloads.

### Board

The board (handoff 3c, `src/app/board/`) shows the project's statuses as
columns, whatever the list's group-by, through the same `GroupedTaskPager`.
`state.columns` lists every group, empty ones included. The header's `sliders-horizontal`
button opens the Filters sheet (with a dot while filters are set) in place
of the strip, and a status filter narrows the columns. The board has no
create button.

- **Layout** (`app-task-board`):
  - A rail of status pills with counts follows the horizontal scroll and
    jumps to a column.
  - Columns are 296 px wide with a 12 px gap and snap to the centre
    (`scroll-snap-type: x mandatory`, `scroll-snap-align: center`), so the
    columns either side peek. The side gutter is `(width − 296) / 2`, at
    least 16 px (about 40 px on a phone). A column scroll is always one
    308 px step.
  - The board fills the content: each column's head stays put while its
    cards scroll.
  - Each column loads whole: the page starts the pager with 100 rows a
    request (`BOARD_PAGE_SIZE`) and `createdAt,desc` whatever the list's
    sort, then `loadAllIn(key)` fetches the rest of every column. A column
    shows skeleton cards until it is whole, and Retry if a page fails.
  - Cards are in board order (`boardOrder()`, `src/core/board/`): position,
    then newest first, as on flux-web. The server can't sort by position
    (it isn't in its sort whitelist), so the pager sorts a group once it's
    complete (`start`'s `order` option).
- **Cards** (`app-board-card`) are plain divs:
  - type icon, key and priority, then the title;
  - up to two chips, the first release (violet) then labels;
  - the due date, red with a clock when it's today or past;
  - a 26 px avatar.

  The list response has no comment or attachment counts, so the cards
  don't show 3c's counts.

- **Drag** (`board-drag.ts`, pointer events; `ion-reorder-group` only
  reorders vertically) is EDITOR+ only:
  - A 400 ms long press picks a card up. Moving more than 8 px first is a
    scroll.
  - A ghost copy follows the finger. Resting within 40 px of a screen edge
    for 500 ms scrolls one column that way, and repeats.
  - Once a card is up, `touchmove` is cancelled so the browser can't start
    a scroll (which would fire `pointercancel`). The click after a drop is
    swallowed.
  - `slot` is where the held card would go among the column's other cards
    (how many have their middle above the finger), and `dropped` gets it.
    Holding within 40 px of a column's top or bottom scrolls it 8 px every
    16 ms (`columnScroller`), so a card reaches anywhere in a long column.
  - A column the type can't use (`blockedReason()`) dims and gives the
    reason, and refuses the drop.
  - `dropAction()` (`src/core/task-status/`) decides the drop: a closed
    status opens the status sheet with its resolution picker; anything
    else goes through `TaskStatusService.move()` with Undo.
  - Haptics: light on pickup, medium on the drop.
- **Order** (FM-40). A column can be reordered when it is loaded whole
  and no status, priority or assignee filter is set (`canReorder`): the
  server renumbers only the ids it's sent, so a partial column would
  collide. The AI filter doesn't count, as on flux-web.
  - While a card is held, its place closes up (`lifted`) and the cards
    slide apart to open a card-sized gap where it will land, also where it
    already is. The gap is a margin (`--drop-gap`), not a transform, so
    the cards' measured positions include it and the drop point doesn't
    flicker at its edges. It slides as it moves (`gliding`, from 100 ms
    after the pickup), but opens and closes at once: the held card's
    place closes instantly, so a sliding gap made the cards under it jump
    up and back. A first try with a 2 px line was hidden under
    the ghost, which follows the finger where the card was grabbed.
    Under filters the held card dims in place as before, with no gap.
  - A drop in its own column rearranges it at once (`GroupedTaskPager.reorder()`)
    and `BoardOrderService` saves the whole column with
    `PATCH /projects/{p}/tasks/reorder`. If that fails, the old order comes
    back with the server's message. The response (no assignees) isn't used.
  - A drop on another column lands at the drop point (`placeTask(…, index)`),
    and once the status change succeeds the destination column's order is
    saved, because a status change keeps the task's old position. A closed
    status keeps the drop point until the sheet's resolution is picked.
  - Without a drop point (filters set, or a column still loading), and for
    Undo or a change from task detail, a card goes where its position puts
    it (`boardIndex()`). Undo doesn't save the old column's order, and a
    reorder has no Undo, as on flux-web.
  - Without a drag (FM-55, WCAG 2.5.7): while `canReorder`, each card has a
    ⋯ button (`button.reorder`, a sibling of the card's link, marked
    `data-no-drag` so a press on it never picks the card up). It opens the
    board's reorder sheet: Move to top, Move up, Move down, Move to
    bottom, each disabled where it would change nothing. A move emits
    `dropped` with the index a drop there would give, so it saves like
    one. 3c has no such button.
- **Pull-to-refresh.** Ionic's gesture refresher (Android, web) only
  checks that the page is at its top. So the board turns it off
  (`blocksRefresh`) while a card is held, and for a touch that starts in a
  column already scrolled down. A refresh that starts cancels a press that
  hasn't picked up yet. iOS uses the native refresher, which reads the
  content's bounce, so on iOS the board is 1 px taller than the content;
  that refresh starts from the rail and column heads.
  This hasn't been tried on an iPhone yet.
- **Add task to <status>** ends each column except closed ones (EDITOR+).
  - It opens the create sheet with that `status`.
  - The callout then says the task starts there (`createdStatus()` in
    `@core/task-create`). If the drafted type can't use the column, it says
    why and names the normal starting status.
  - After the create, the page moves the task there quietly
    (`move(…, undoable = false)`), because the create POST has no status.
    That status change can run the status's `assignmentRule` on the server.
  - The task goes last in the column, as the server puts a new task in its
    starting status, and the column's order is saved as after a drop.

### Calendar

The calendar (handoff 3d, `src/app/calendar/`, `app-task-calendar`) shows
the project's tasks by date, month scope only. Like the board, it swaps the
strip for the header's Filters button and has no create button. The
subtitle reads `Calendar · October 2026`.

- **Month.** `‹ October 2026 ›` and Today sit over a Monday-first grid
  (`monthGrid()`, `src/core/calendar/`), 4 to 6 weeks as the month needs.
  - Days from the months either side and weekends get a dimmer number, and
    weekends get the `--na1` wash.
  - Today has the indigo wash, a 1.5 px ring and the number in a filled
    circle.
  - The page keeps the month (`calendarMonth`) for the session, across
    projects and filter changes.
- **Loading.** Every month change loads its whole window: `dueDateFrom` and
  `dueDateTo` are the grid's first and last day (`monthWindow()`), with the
  filters and AI filter, every page of 100 (`allPages()`). The server
  returns a task whose span overlaps the window. The span is
  `plannedStartDate`…`plannedEndDate` when the task has them, else its
  `dueDate` (`taskSpan()`), so a ranged task shows on every day of it.
- **Pills.** A day shows two lines (`dayLines()`): two stripe pills, or one
  and `+n more`.
  - A pill is 15 px, with a 3 px stripe in its status's hue on that hue's
    wash (`groupHueColors()`), or red once the span has ended on an open
    task (`isOverdueSpan()`).
  - Tapping a pill opens task detail on the Projects stack.
  - `+n more`, or a tap elsewhere on a day with tasks, opens the day sheet:
    that day's rows.
  - Releases aren't drawn: they stay display-only. Only the `stripe` pill
    style exists (`calendarPillStyle` isn't read).
- **Unscheduled drawer.** An inline `ion-modal` that is always open. Its
  handle row and rows are `app-unscheduled-list`.
  - Breakpoints are `[0.08, 0.5, 1]` with `backdropBreakpoint: 0.5`, so the
    calendar stays usable behind the 0.08 handle row. There's no 0 stop
    and no backdrop dismiss, so nothing closes it, and Android's Back
    passes it by.
  - Its rows are `onlyUnscheduled=true` (no due date and no planned start),
    50 a page, and the head shows the count.
  - Ionic presents an inline modal from `ion-app`, over the whole screen.
    So the drawer stands on the tab bar (`--drawer-bottom`, the bar's
    height, measured with a ResizeObserver), which makes 0.08 the 59 px
    handle row. The grid keeps that much free at its bottom.
  - Ionic stops checking a page's bindings once it has left, so the page's
    `ionViewWillLeave`/`ionViewWillEnter` call the calendar's `leave()` and
    `enter()`. They dismiss and present the drawer, and close the day
    sheet, so neither stays over task detail or another tab.
- **Drag** (EDITOR+, `can(role, 'edit')`) reuses `BoardDrag`, with days as
  its columns (`data-column="<date>"`):
  - Pills and drawer rows (`elsewhere`, since the drawer is outside the
    calendar) can be picked up. The ghost is a pill-sized copy of the key,
    floating above the finger.
  - `isolate` stops a held task's `touchmove` and `mousemove` at the window
    in the capture phase, so Ionic's sheet gesture can't move the drawer
    along with it. A pickup from the drawer collapses it to 0.08.
  - The day under the finger lights up. A drop on the drawer or outside
    the grid does nothing: there's no unscheduling.
  - `rescheduleChange()` decides the write, as flux-web does. A task with
    both planned dates moves both by the days dragged, keeping its length,
    and its due date stays. Anything else, or a task from the drawer, gets
    that day as its due date. Without a drag, the due date and the planned
    range are edited on task detail.
  - `TaskEditService.reschedule()` writes it through `update()` (the PUT
    that sends every field back), then offers Undo. Undo puts the old dates
    back, so a drawer task returns to the drawer.
  - The Undo toast sits above the drawer's handle row.
  - Haptics: light on pickup, medium on the drop.
- A change made on task detail moves or drops a task here too
  (`TaskChangesService`). Pull-to-refresh reloads the month and the drawer.

### Task detail

Task detail (handoff 3e–3g, `src/app/pages/tasks/`) has a header block
(back, type icon, key with a copy button, the watch bell, ⋯ for the
overflow sheet, the title up to 3 lines, then status, priority and type
chips) over Details, Comments and Activity tabs. The bell
subscribes with `POST .../subscribe` and unsubscribes with `DELETE`,
showing the change at once and putting it back with a toast if the server
refuses. The key is copied with `@capacitor/clipboard`.

The docked action bar (`task-action-bar/`) has a comment button (it opens
the Comments tab and focuses the composer). For an EDITOR+ it also has "Move
to <next status>", or "Change status" when there is no next one. A VIEWER
gets no bar. The caller's role and the project's `categoryPositions` come
from `MyProjectsService`.

- List rows pass themselves in the navigation state (`[state]="{ task }"`),
  so the header fills from the row while the task loads and only the body
  shows skeletons. A deep link has no row, so the header shows skeletons
  too.
- A task only carries its status slug, so the status pill's name and hue
  come from the project's workflow statuses (`status-pill.ts`).
- **Details** (`task-details/`) shows the first assignee plus `+n`, the
  reporter, due date (`12 Sep · overdue` in red), the planned start and
  end (ours, FM-55: 3e has no planned rows), release (the first
  linked release, display-only), parent, labels (two, then `+n`), the
  description clamped to 6 lines with Show more, and subtasks for MASTER
  and EPIC only (`GET .../children`). Parent and subtask links push onto
  the same stack. See Editing below for what it edits.
- **Comments** (`task-comments/`) loads with the page, so the tab shows a
  count: the server pages top-level comments (100 a page, oldest first)
  with their replies nested, and its total counts threads only, so
  `commentCount()` adds the replies. The caller's own comments are
  tinted. See Comment writing below.
- **Activity** (`task-activity/`) loads the first time its tab opens,
  newest first, grouped by day (`activityDays()`), with `activityView()`
  (`src/core/task-detail/`) deciding each entry's icon, tint and wording.
- Pull-to-refresh reloads everything; each part has its own error state
  with Retry.

**Attachments.** `src/app/attachments/`; the backend keeps them on the
task only (no comment attachments).

- The task carries no count, so detail loads
  `GET .../tasks/{t}/attachments` (a plain array, newest first) with the
  task. The last card in Details (after the description) shows the count
  (`—` if it failed) and opens the attachments sheet.
- The sheet lists each file with a 40px thumbnail (`thumbnailUrl`, set for
  jpeg/png/gif/bmp) or a type icon, then size · uploader · age (`fileSize()`
  and `uploaderName()` in `src/core/attachments/`).
  - `uploadedBy` is only an account id, so the uploader comes from
    `/members/assignable`; anyone else is "Former member".
  - An EDITOR+ on a task that isn't archived also gets the sources to add
    one.
- **Opening.** The file URLs are S3 presigned GETs: they need no token
  (adding one breaks the signature), and they expire 15 minutes after the
  list call that signed them, or are null when the server can't sign.
  - Tapping a row opens `previewUrl` (served inline) with
    `@capacitor/browser` on native (SFSafariViewController or a Custom Tab),
    or a new tab on web.
  - A list older than 10 minutes is fetched again first.
- **Uploading.** `AttachmentService.upload()` POSTs multipart (field `file`)
  and puts the result at the top, or toasts `uploadErrorMessage()`. That
  is the server's 422 message (size, extension, count, uploads off).
  - A 413 has no message: Spring's multipart limit answers with a
    ProblemDetail, and production nginx caps bodies at 20 MB with an HTML
    page. It says "This file is too large to upload." instead.
  - HEIC is refused by the server.
- **File sources.** `FileSourceService` offers Take photo
  (`Camera.takePhoto`), Choose photo (`Camera.chooseFromGallery`), both
  JPEG, and Choose file (`@capawesome/capacitor-file-picker`).
  - On web only Choose file, which reaches images too.
  - A picked file is read with `fetch()` from its WebView-served path,
    which CapacitorHttp passes through.
  - A cancel is silent. A denied camera or photos permission shows an
    alert saying to turn it on in Settings.
  - iOS has `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`
    and `NSPhotoLibraryAddUsageDescription` (the camera plugin's list). The
    Android camera and photo picker need no permissions (no
    `saveToGallery`).
- Deleting an attachment isn't built (the backend allows EDITOR+).

**Status changes.** These come from the status pill (a button for an
EDITOR+), the docked bar and the list's swipe actions.

- The status sheet (3h, `src/app/task-status/status-sheet/`, an
  auto-height `flux-sheet flux-sheet-auto` modal) groups the workflow by
  category. It marks the current status and the suggested next one, and
  shows statuses the type can't use as disabled, with the reason.
- A closed status (`isClosed`) opens its resolution picker inline
  (`GET /projects/{id}/resolutions`), so it can't be chosen without one.
  The docked button and the swipe open the sheet that way when the next
  status is closed.
- The rules are in `src/core/task-status/`:
  - `allowedStatusCategories()`: MASTER/EPIC use PLANNING or DONE, other
    types use TODO, IN_PROGRESS or DONE. This is the backend's only
    transition limit.
  - `nextStatus()`: the first later status in `workflowOrder()` that the
    type may use.
  - `statusSheetGroups()`: the sheet's groups and rows.
- `TaskStatusService` (`src/app/task-status/`) does the write:
  1. It shows the change at once.
  2. It sends `PATCH .../status`.
  3. It fetches the task again (`GET`), because the response has
     `assignees: []` and no joined fields.
  4. It offers a 4 s Undo toast, above the tab bar or the docked bar. That
     toast is `UndoToastService`, shared with archiving and calendar
     reschedules, so only one Undo is on screen.

  If the server refuses, the task is put back and the server's message
  shown. Offline, or when the PATCH gets no response, the change is
  queued instead (see Write queue under [Offline](#offline)), and
  `move()` resolves `'queued'` rather than `'sent'`.

- Archive (`POST .../archive`, which archives the subtree, so the list
  drops the subtasks it shows too) also offers Undo. That calls
  `POST .../unarchive` with a fixed reason.

**Editing.** An EDITOR+ edits a task that isn't archived (the server
refuses those with `TASK_ARCHIVED_READ_ONLY`). Every choice is a bottom
sheet (an inline `flux-sheet` `ion-modal`):

- Tapping the title opens a text sheet (required, at most `TITLE_MAX`, 120
  characters; Enter saves). The priority and type chips become buttons that
  open single-choice pickers. A type change can move the status; the server
  does that.
- In Details, the Due date, Planned start, Planned end and Labels rows get
  a chevron. Due date opens `ion-datetime presentation="date"` (with
  Clear), and so does each planned row. `plannedChange()`
  (`src/core/task-edit/`) keeps the range whole, as the server refuses one
  with a single end or that ends before it starts: an end set alone gives
  a one-day range, an end moved past the other moves it along, and Clear
  clears both. The description's pencil
  opens a Markdown textarea and saves `descriptionFormat: 'MARKDOWN'`.
  Descriptions stored as HTML or Editor.js (`canEditDescription()`) show
  "Formatted on the web — edit it there." instead. The Parent row keeps
  opening the parent.
- The ⋯ overflow sheet (3n, `task-overflow-sheet/`) has Reassign (LEAD+),
  Change parent (EDITOR+), Copy link, Watch/Stop watching, Archive (EDITOR+,
  DONE category only), and Delete (LEAD+) in red after a band. Each row
  shows only for roles that may use it, and the chosen action runs once the
  sheet has closed.
  - Copy link copies `<webBaseUrl>/projects/{projectId}/tasks/{taskId}`,
    flux-web's task route.
  - Archive uses `TaskStatusService.archive()` with Undo; detail stays open
    on the archived task.
  - Delete asks first with an `ion-alert` naming the key (flux-web's
    wording), then `DELETE .../tasks/{id}` and goes back.
- The shared sheets are in `src/app/shared/`:
  - `picker-sheet/` is the one searchable picker (`ion-searchbar` over a
    list, single or multiple choice). Labels, parent, assignees, priority and
    type use it, and so does the create sheet. A multiple choice edits
    a draft that the page applies when the sheet closes. With
    `remoteSearch`, it emits `searched` 300 ms after typing pauses.
  - `text-edit-sheet/` (title, description) and `date-sheet/` (due date).
- `TaskEditService` (`src/app/task-edit/`) does the writes like
  `TaskStatusService`: show the change, write, fetch the task again (the
  responses have `assignees: []`) and report it, or put it back and show
  the server's message.
  - `update()` sends `PUT .../tasks/{id}` with `taskUpdateBody()`
    (`src/core/task-edit/`). The PUT replaces the task: a missing title,
    description, type, priority or format is kept, but every other missing
    field is cleared. So the body always sends back `dueDate`, the planned
    dates, `labels`, `environment`, both versions, `bugOccurredAt` and
    `affectedUser`, and its spec fails if one is dropped. flux-web's
    calendar and detail page lose data this way; don't copy them.
  - `setLabels()` uses `POST`/`DELETE /projects/{p}/labels/{labelId}/tasks/{t}`
    (labels from `GET /projects/{p}/labels`, matched to the task's label
    names by name), never `labels` on the PUT, which doesn't keep the
    server's label links in step.
  - `setParent()` is `PATCH .../parent` (`parentTaskId: null` moves to the
    root). The picker searches MASTER and EPIC tasks (`parentTypes()`: a
    MASTER only under a MASTER). The server checks cycles, types and depth.
  - `assign()` is `PATCH .../assign`, which replaces every assignee, so the
    picker is multi-select and starts from the current ones.

**Comment writing.** `CommentService` (`src/app/comments/`) does the
writes. Each one waits for the server, then changes the loaded thread in
place with `PagedList.edit()` and `withComment()`/`withoutComment()`
(`src/core/comments/`), or shows the server's message in a toast. No write
refetches the thread. A new comment written offline is queued instead
(see Write queue under [Offline](#offline)); edits, deletes and reactions
toast that they need a connection.

- On the Comments tab a COMMENTER+ gets the composer
  (`comment-composer/`, 3f) in place of the action bar: an
  `ion-textarea autoGrow` with an @ button, and Send.
  - Comments are posted as MARKDOWN and appended to the loaded thread. If
    the thread still has pages to load, the new comment sits above them
    until it reloads.
  - The POST and PUT responses have no reactions or replies, so an edit
    merges the body and `edited` into the shown comment.
  - An EDITOR+ also gets a paperclip, which uploads to the task (see
    Attachments above). It asks where from in a source sheet, or goes
    straight to the file picker on web. The comment text is left alone.
- **Mentions:** an @ that starts a word, or the @ button, opens the member
  picker (`/members/assignable`, without the caller).
  - A mention is plain `@First Last` text. Its id goes in
    `mentionedAccountIds` while that text stays in the comment.
    `mentionedAccountIds` only drives the server's notifications.
  - Unlike the web's Editor.js mention spans, these carry no account id, so
    on the web they render as styled names (two capitalised words) and
    can't be clicked.
- **Reactions:** the server stores keys (`thumbs_up`, …), and
  `reactionGlyph()` maps them to flux-web's eight glyphs (`REACTIONS`).
  - Any role reacts. A pill toggles that reaction, and the smile-plus
    button opens the comment sheet (`comment-sheet/`) with all eight.
  - Like the web, each person keeps one reaction per comment.
    `reactionToggles()` takes the caller's old one off first, though the
    server would allow several.
- **Edit and delete:** the caller's own comments get a ⋯ that opens the
  same sheet with Edit and Delete (both author-only, COMMENT_NOT_AUTHOR).
  - Edit uses the text sheet in Markdown. A comment stored as HTML or
    Editor.js (`canEditComment()`) can't be edited here.
  - Delete asks first with an `ion-alert`. COMMENT_HAS_REPLIES shows the
    server's message.
- The composer relies on Capacitor's `resize: 'body'` to stay above the
  keyboard, and on Ionic hiding the tab bar while the keyboard is open.

**Rich text.** Descriptions and comments are stored as MARKDOWN, HTML or
EDITORJS, and older rows hold Editor.js JSON under MARKDOWN, so the format
is detected by content too. `renderRichText()` (`src/core/rich-text/`)
renders Markdown with `marked`, converts Editor.js JSON with a trimmed port
of flux-web's `json-to-html.ts`, and always finishes with DOMPurify, using
flux-web's sanitizer policy (no scripts, frames, forms or inline styles).
`app-rich-text` binds that output with `bypassSecurityTrustHtml`, since
Angular's own sanitizer would strip mention ids. Links get
`target="_blank"`, so they open in the system browser instead of replacing
the WebView. Editor.js images that are uploads (`file.uploadId`) show a
placeholder: they come from a separate pipeline (`/uploads`, signed with
`GET /uploads/{id}/url`), which the app doesn't call yet.

**Roles.** `can(role, action)` (`src/core/permissions/`) holds the
backend's minimum role for each action: VIEWER reads, COMMENTER comments,
EDITOR edits, changes status, creates and archives, and LEAD reassigns and
deletes (MANAGER ranks above LEAD). `MyProjectsService`
(`src/app/projects/`) caches `GET /projects/mine` once per signed-in
account, and exposes `role(projectId)` and `can(projectId, action)`. The
Projects tab and My Work search load their projects through it, and the
Projects tab's pull-to-refresh calls `invalidate()` first, so the counts
are fresh.

### Accessibility

FM-55 checked My Work, Projects (list, board, calendar), task detail, the
Inbox, Settings and their sheets with axe (WCAG 2.2 A and AA) in light and
dark. Keep to these patterns:

- Decorative icons are `aria-hidden`; icon-only buttons have an
  `aria-label`; a glyph that carries state is `role="img"` with a label
  ("Waiting to sync").
- Text for screen readers only goes in a `.flux-sr-only` span
  (`global.scss`): a count's noun ("3 tasks"), an Inbox row's "Unread,",
  a calendar day's full date. Never `aria-label` on a `span` or
  `ion-badge`: a generic element's label isn't read. Hide the visible
  number (`aria-hidden`) when the span repeats it.
- Every sheet `ion-modal` has an `aria-label`, which Ionic moves onto its
  dialog; the create sheet passes it in `htmlAttributes`. A button that
  opens a sheet has `aria-haspopup="dialog"`.
- `ion-searchbar` always names its input "search text", so searchbars set
  `appSearchLabel` (`src/app/shared/search-label.directive.ts`).
- A choice row (pickers, view options, filter sheets) is a plain
  `ion-item` holding a native `button.choice` with `role="radio"` or
  `"checkbox"` and `aria-checked`, inside a `div` with the radiogroup or
  group role. On an `ion-item button` the role sat on the host around
  Ionic's own native button, and Ionic can overwrite a role bound with
  `[attr.role]` on its hosts.
- Grouped lists (My Work's buckets, the Projects list, the Inbox, the
  switcher) put `role="none"` on the `ion-list` and `role="list"` on each
  `ion-item-group`, whose rows are the list items. Ionic gives the list the
  list role and its groups the group role, which left the rows' listitem
  role outside a list. Static attributes stick; bound ones may not.
- Every swipe has another way in: the next status and More (task detail's
  docked button and status pill), Archive (the overflow sheet), Inbox Mark
  read (tapping the row) and Mute (the bell, or Stop watching), and the
  switcher's pin button. Ionic keeps `ion-item-options` `display: none`
  until a swipe starts, so a screen reader never meets them.
- Known exceptions: the calendar's 15px pills and Ionic's sheet handles
  are under 24px (WCAG 2.5.8), allowed because the day cell (its sheet
  lists the same tasks) and the drawer's head do the same; `index.html`
  keeps `user-scalable=no`, and text follows the OS size up to 120%
  instead (see [§7](#7-theme)).
- Not yet checked with VoiceOver: there's no Mac or iPhone here.

### Task create

My Work and the Projects list (not the board) have a create button (`app-create-task-fab`,
`src/app/task-create/`, 3i's FAB: bottom end, 20px above the tab bar), shown
to an EDITOR+ in the open project, or on My Work in any project. The lists
pad their bottom so it never covers the last row. It opens the create sheet
(`CreateTaskSheetComponent`) through `CreateTaskLauncherService`:

- The sheet is presented with `ModalController` from the app root, not
  inline in the page: the iOS card effect (`presentingElement`, the root
  `ion-router-outlet`) scales the presenting element, and would scale a
  modal declared inside it too. Its inputs arrive through `componentProps`,
  which reach signal inputs because `main.ts` sets Ionic's
  `useSetInputAPI`. While it's open, `StatusBarService.forceDark()` turns
  the status bar's text light and, on iOS, `Keyboard.setAccessoryBarVisible`
  hides the native accessory bar. The sheet draws its own
  (`AccessoryBarComponent`), always shown: the paperclip (Choose photo or
  Choose file), the camera on native, and Done while the keyboard is open.
  There is no @ or mic.
- It starts in the open project, or on My Work in the project opened last
  on the Projects tab (`initialProject()`), and lists only EDITOR+
  projects. Changing project drops the assignee, labels and parent.
- Only the title is required (`TITLE_MAX`, 120; Enter moves on to the
  description, which is Markdown). The type chip lists the types the
  parent allows (`allowedChildTypes()`, `src/core/task-create/`), and the
  parent picker searches the types the type allows (`parentTypes()`). The
  assignee, priority, due date, labels and parent chips open the shared
  pickers. The server takes one `assigneeId`, so the assignee picker is
  single choice. Release is display-only, so there is no release chip.
- The callout says what the task will start as: `startingStatus()` mirrors
  flux-operations' `resolveDefaultStatusForType` (the project's `isDefault`
  status for a leaf type that may use it, else the first TODO/IN_PROGRESS
  status by position, or PLANNING for masters and epics), plus the chosen
  assignee or "unassigned". A workflow status's `assignmentRule` only runs
  on a status change, never on create, so it isn't mentioned.
- `TaskCreateService` does the write: `POST /projects/{p}/tasks` with
  `createTaskBody()` (unset fields left out so the server's defaults apply),
  then each label through `POST /labels/{id}/tasks/{t}`, one at a time, and
  the task fetched again. Labels sent on the POST would only reach the
  task's own column, not the server's label links. Then each picked file
  is uploaded, one at a time (listed under the chips until then, and
  counted by the discard check). A failed create shows the server's
  message and keeps the form; a failed label or file still counts as
  created, and the toast says so.
- Success shows a 4 s `CHK-161 created` toast with Open, which pushes task
  detail onto the current tab. "Keep the sheet open to add another" clears
  the form (files included) but its project and type instead of closing. Cancel or a swipe
  down asks "Discard this task?" when anything was entered (the modal's
  `canDismiss`).
- The Projects list puts a task created in its project at the top of its
  group (`GroupedTaskPager.placeTask()`) if the filters let it in; under a
  sort other than newest first it stays at the top until the list reloads.
  My Work reloads its lists instead, because its rows carry project and
  status names a created task lacks.

### Inbox

The Inbox tab (handoff 3l, `src/app/pages/notifications/`) lists the
account's notifications, newest first.

- **Header:** "Inbox" over `4 unread · 1 mention`, and an outline Mark all
  read (`check-check`, disabled at 0 unread). The push card
  (`app-push-card`, see Push below) sits at the top of the list.
- **Segments:** All, Mentions (`MENTION,DESCRIPTION_MENTION`, with a red
  count while it has unread) and Assigned (`ASSIGNMENT`), from
  `INBOX_SEGMENTS` (`src/core/inbox/`). Each is its own
  `GET /notifications?type=` query, paged 30 at a time with `PagedList`,
  and loads the first time it's opened. Each segment has its own `opened`
  signal: a resource whose params read a shared signal reloads whenever
  that signal changes, even when its params come out the same.
- **Groups:** Today and Earlier by the device's local day (`inboxGroups()`),
  in the server's order, under 32px sticky headers. With every page loaded,
  a footer hint says "Swipe a notification to mark read or mute the task".
  Pull-to-refresh, infinite scroll with Retry, skeleton, error and the
  "You're all caught up" empty state are the shared ones.
- **Rows** (`app-notification-row`, `src/app/inbox/notification-row/`):
  `notificationView()` splits the message, which the server always writes
  as `<actor><verb>: <subject>`. With FM-42's actor fields the name leads
  (700 while unread, 600 once read) and the rest is the verb ("and 1 other
  reacted to your comment on"). An older row has no actor, so its whole
  prefix leads. Comments, mentions and reactions lead with the actor's
  32px avatar, everything else with a tinted glyph (Activity's icons and
  tones). Unread rows get a 3px `--flux-p9` rail on the item's `native`
  part, so it slides with a swipe. The age is `relativeTime()`, and task
  rows end with the mono key and the project.
- **Tap:** an unread row is marked read at once with
  `PATCH /notifications/{id}/read`, and put back with the server's message
  if that's refused. A row that `opensTask()` (a TASK with a key, not
  TASK_DELETED) then pushes task detail onto the Inbox stack. A release,
  a deleted task or a row from before FM-42 only marks itself read.
- **Swipes,** both at the end. A light haptic on reveal, a medium one on
  commit.
  - Mark read (indigo, `expandable`, unread rows only) shows the row as
    read at once with a 4 s Undo. The server has no way back to unread, so
    the PATCH waits for `UndoToastService.offer()`'s `onExpire`, which
    runs when the toast goes without Undo (timed out, or replaced by
    another toast). A read is lost if the app is killed in those 4 s.
  - Mute (gray, task rows only) is `DELETE .../subscribe` with a short
    `Muted CHK-142` toast and no Undo. It only stops the task's activity
    notifications, not mentions or assignments, so it's labelled only
    "Mute".
- **Mark all read** sets every loaded row and both counts to read at once,
  then `PATCH /notifications/read-all`, with no Undo or confirm. It first
  takes down a pending swipe's Undo (which sends that read). A failure
  puts everything back with the server's message.
- A read change edits the row in every segment it's loaded in (a mention
  is in All too), and moves the counts at once.
- **Counts:** `InboxService` (`src/app/inbox/`, started from an app
  initializer) holds `unread` and `mentions`, two
  `GET /notifications/unread-count` calls, undefined until loaded. They
  load once the session is restored and on each sign-in, clear on
  sign-out, and refresh on app resume, on pull-to-refresh, after each
  read write settles, and for a push (see Push below). A count that
  fails keeps its last value.
- **Tab badge:** the Inbox tab shows `unread` as a red `ion-badge` (17px,
  `--flux-red9`, a 2px ring in the tab bar's colour), `99+` above 99 and
  hidden at 0. The handoff's "seen" marker (`/unseen-count`) is the web
  bell's; the app uses unread. The server sets no app icon badge.

### Offline

`ConnectivityService` (`src/app/offline/`) holds `online`, from
`@capacitor/network` (the browser's online/offline events on web). Its
app initializer is awaited, so a cold start that's already offline knows
before the first screen renders. The status is checked again on resume,
since a change made while suspended may never arrive. It reads as online
until that first check, and a failed check keeps the last value.

`app-offline-banner` is the handoff's offline band: 28px (a min-height),
`--flux-ambera3` with `--flux-amber11` text, `cloud-off` and "Offline ·
showing cached work", or "Offline · 2 changes waiting" with the write
queue's count. Back online it stays as "1 change needs attention" (`info`)
while a queued item is a conflict or failed. My Work, Projects (all three
views), Inbox and task detail put it last in their `ion-header`, as the
app shell has no header of its own. See Pending changes below for what a
tap on it opens.

**Read cache** (FM-48). A cache, not offline-first: only responses
already fetched are served back, never queried or merged.

- `CachingFluxApi` (`src/core/offline/`) wraps `HttpFluxApi` as `FLUX_API`.
  Online, every read goes to the server and a success is saved; an
  `ApiError(0)` is answered from the cache when it can be, and any other
  error is the caller's. Offline (`!online()`), no read touches the
  network: it's the saved copy or an `ApiError(0)` at once, which also
  skips the token refresh's backoff. Writes always pass straight through.
- `cacheKey()` holds the allow-list: My Work, the Projects list, task
  detail and the Inbox, first pages only. It leaves out My Work search
  (`openOnly=false`), project search (`search`), the board (100-row pages,
  above `PROJECT_PAGE_SIZE`), the calendar (`dueDateFrom`/`dueDateTo`,
  `onlyUnscheduled`) and every later page. Focus is keyed without its
  `dueDateTo`, so yesterday's Focus still shows offline today. Labels and
  push preferences aren't cached. The key is the method plus its
  arguments as JSON with sorted keys.
- `ResponseCache` keeps one blob per response plus `index.json`, for one
  account: using it for another account wipes everything first. An entry
  older than 7 days is a miss, and past 10 MB of JSON the
  least recently fetched go first. It runs one operation at a time, and a
  store failure is logged and reads as a miss, never failing the request.
- `CACHE_STORE` is `FileCacheStore` on native (`@capacitor/filesystem`,
  `Directory.Cache`/`flux-cache/`: app-private and never backed up; a file
  the OS purges is a miss) and `MemoryCacheStore` on web, so a browser
  reload loses it with the session.
- `ReadCacheService` (`src/app/offline/`) owns the cache and wipes it
  whenever no one is signed in. It watches `isSignedIn`, not the account,
  because an offline cold start can be signed in with no account.
- After a write online, a cached list page keeps its old rows until that
  list is fetched again; task detail refetches the task after each write.
- A saved view or group-by (`updateTaskViewSettings`) replaces the cached
  view settings, since the PUT returns them whole, so a launch offline
  opens the view chosen last. One switched while offline isn't saved, and
  the cache keeps the old view.

**Write queue** (FM-49, FM-50). Status changes and new top-level comments
are queued.

- `WriteQueue` (`src/core/offline/`) keeps status changes and comments
  made offline, in order, as one blob per account
  (`write-queue.<accountId>.json`). Each item has a `kind` (`status` or
  `comment`; an item saved before comments has none and loads as a
  status change). Signing out hides them and deletes nothing: they replay
  once that account signs in again, and another account never sees them.
  An item is `queued`, `sending` (back to `queued` at load, in case the
  app was killed mid-send), `conflict` (status changes only) or `failed`.
- Changes to one task merge while queued: the first `from`, the last
  `to`. One back at its `from` (same slug and resolution) is dropped,
  which is how Undo cancels it. A change after a `sending` one is a new
  item from that one's `to`; one after a conflict or failure replaces it.
- `TaskStatusService.move()` queues when `online()` is false, when the
  PATCH gets an `ApiError(0)`, or when the task already has a `queued` or
  `sending` change (so changes stay in order). It keeps the change on
  screen, reports it to `TaskChangesService` without a refetch (that
  would be the pre-change cache), and offers the usual Undo. With no
  account loaded (an offline cold start of a session saved before
  accounts were) it puts the task back as before. A closed status works
  offline when its resolutions are cached; the sheet's error otherwise.
  A board drop that queues skips the column order save.
- `QueueReplayService` (`src/app/offline/`) replays in the foreground
  only: at launch, on sign-in and when `online` turns true (one effect),
  and on resume. Items go one at a time through `NETWORK_FLUX_API`, so
  the check never reads the cache: the task is fetched, and sent only if
  its status is still the item's `from`. Already at `to` drops the item;
  any other status is a `conflict` and isn't sent (a small race remains
  between the GET and the PATCH; the backend has no precondition). A
  status 0, a 5xx or a session that ended stops the replay with the item
  `queued`. Any other 4xx (the endpoint documents 400, 403 and 404) is
  `failed`, with the server's message.
- Each settled item is fetched again through `FLUX_API` (so the cache
  holds the new copy) and reported; a 403 or 404 reports it removed. A
  conflict or failure puts the server's status back and says so in one
  toast ("CHK-142 changed on the server, so your status change wasn’t
  sent.", "Couldn’t move CHK-142: …", or a count). A conflict keeps the
  server's status as `current`. Conflicts and failures stay in the queue
  until the person settles them in the pending changes sheet, or a newer
  change to that task is queued or sent online (`dropUnsent()`). After a replay that settled
  anything, My Work's three lists (`myWorkQueries()`) are fetched again
  through `FLUX_API`: Ionic doesn't run a hidden page's effects, so a
  hidden My Work would otherwise reload its old cached rows once offline.
- `CachingFluxApi` takes `queuedStatus`, and `getTask`, `listMyTasks`
  (with `statusName`), `listProjectTasks` and `listChildTasks` show a
  `queued` or `sending` change's status, from the network or the cache. A
  conflict's isn't shown.
- `WriteQueueService` holds the queue as signals: `items`,
  `pendingTaskIds` (status changes queued, sending or conflict; the rows'
  glyph) and `queuedStatuses`, which only changes when a shown status
  does. My Work
  reloads its lists on it; the Projects list and board move a task that
  arrives in its old status's group into its queued one; task detail
  applies a reported change for its own task.
- A pending task gets the handoff's `refresh-cw` glyph (12px, "Waiting
  to sync"): in My Work rows' status, at the end of project rows' meta
  line (list, Unscheduled drawer, day sheet), after a board card's key,
  and in task detail's status pill.
- **Comments.** `CommentService.post()` queues the comment (body,
  `mentionedAccountIds`, sent as MARKDOWN) when `online()` is false, when
  the POST gets an `ApiError(0)`, or when the task already has a queued or
  sending comment (so they stay in order), and resolves `'queued'`; the
  composer clears. Comments never merge, and edits, deletes and
  reactions aren't queued.
  - Replay sends them in their place among the status changes. A
    comment's POST may land without an answer, so one whose POST went
    out (the online POST that got no response, or any replay attempt,
    including one cut short by an app kill) is marked `attempted`.
    Before sending an attempted comment, the replay reads the newest
    comments (the last page of 100; the list is oldest first and has no
    sort) for a top-level one by the caller with the same trimmed body,
    created no earlier than 5 minutes (`POSTED_CLOCK_SKEW_MS`) before it
    was queued, and if there is one doesn't post it again.
  - A refusal (403 role lost, 404 task deleted, archived) makes it
    `failed`, with the server's message, and the replay's toast says
    "Couldn’t post your comment on CHK-142: …" (or a count). There is no
    conflict state: comments are append-only. `dropUnsent()` leaves
    comments alone.
  - Task detail shows the task's queued comments after the thread
    (`WriteQueueService.pendingComments()`, `app-task-comments`'s
    `pending`), as the caller's tinted bubbles with no ⋯ or reactions:
    "You · Waiting for connection" with `refresh-cw`, or "Not posted ·
    <message>" in red with Copy text (`@capacitor/clipboard`) and Delete
    (asks first, then `discard()`). The tab's count includes the waiting
    ones. A queued comment adds no glyph to rows or the status pill.
  - When the replay posts one (or finds it posted), `WriteQueue` calls
    `onCommentSent` just before the item leaves the list, and
    `WriteQueueService.sentComment` hands the server's comment to task
    detail, which appends it to a loaded thread (unless its id is there
    already), so the pending row turns into it in one step. A comment
    doesn't refetch its task or My Work, and the cached thread keeps its
    old rows until it's fetched again, as after any write online.
- `WRITE_QUEUE_STORE` is `PreferencesStore` on native
  (`@capacitor/preferences`, keys `write-queue/…`, which the OS never
  purges, unlike the read cache's Cache directory) and `MemoryCacheStore`
  on web, the token's default, so a browser reload loses it.

**Pending changes** (FM-51). With changes listed, the banner is a button
that opens `app-pending-changes-sheet` (an inline `flux-sheet
flux-sheet-auto` `ion-modal`, declared outside the band so the band going
doesn't take an open sheet). Nothing in the queue is overwritten or
dropped without the person choosing it.

- Each row is the task key, the change ("Move to In review", or the
  comment's text clamped to 2 lines), its state and its age
  (`relativeTime()`). Status names come from the project's workflow
  statuses (cached), through `statusPill()`.
- Waiting: Discard. A status change is dropped at once and its task
  refetched (`QueueReplayService.refreshTask()`, the cached copy offline,
  now without the queued status); a comment asks first with an
  `ion-alert`. Sending: nothing.
- Conflict ("CHK-142 is now Done"): **Apply mine** makes the item a change
  from `current` and replays. It isn't a blind send: if the task changed
  again meanwhile, the replay makes a new conflict. **Keep theirs**
  discards it and refetches the task. A conflict saved before FM-51 has
  no `current`: it says "CHK-142 changed on the server" and offers only
  Keep theirs.
- Failed ("Not sent · …" or "Not posted · …"): Retry (back to `queued`,
  then a replay; a comment keeps `attempted`), Discard, and for a comment
  Copy text. Task detail's failed comment keeps its own Copy text and
  Delete.
- The sheet closes itself once the queue is empty.
- Signing out keeps the queue, so Settings' "Log out of Flux?" alert says
  "2 changes haven’t been sent. They’ll send when you sign in to this
  account again." (`unsentChangesMessage()`). The lock screen covers
  Ionic's overlays, so it shows that line under "Sign in with password"
  instead of an alert.

**Screens offline** (`OfflineToastService`, `OFFLINE_MESSAGES`):

- Pull-to-refresh on My Work, Projects (all views), task detail and the
  Inbox completes at once, keeps the rows and toasts "You're offline.
  Showing saved work." It doesn't reload, so it never swaps rows for an
  error.
- Later pages fail at once: the Projects and Inbox Retry rows read
  "Loading more needs a connection." while offline, and task detail's
  load-more toast says the same.
- Opening an attachment toasts "Opening files needs a connection." An
  attachment list loaded offline counts as expired, so the first tap
  online signs fresh URLs.
- In the Inbox, swipe Mark read and Mark all read toast "Marking read
  needs a connection." A tapped task row opens from the cache and stays
  unread; a row that only marks itself read toasts the same.
- The writes that aren't queued check `online()` before showing anything:
  field edits ("Editing needs a connection.", `TaskEditService`),
  calendar reschedules ("Rescheduling …"), archive ("Archiving …"), a
  board reorder ("Reordering …"), create ("Creating tasks …", the sheet
  keeps the draft), attaching a file ("Uploading files …", before the
  composer's source sheet or the picker opens), and comment edits
  ("Editing …"), deletes ("Deleting comments …") and reactions
  ("Reacting …"). Edit and Delete check before the text sheet or the
  confirm opens, so nothing typed is lost. Task delete, watch and Inbox
  mute still fail with their usual error.
- A screen with nothing cached shows the existing `app-error-state`.

## 4. API layer

`src/core/api/flux-api.ts` defines a small, hand-written `FluxApi` interface
(Promise-based, not RxJS, so it stays portable) over flux-operations: my
tasks, a project's tasks, one task, its create, update (PUT), parent,
assignees and delete, a status change, archive and unarchive, its
children, a board column's order, activities, comments (list, post, edit,
delete and toggle a
reaction), attachments (list and upload) and subscription (read,
subscribe, unsubscribe), my projects, workflow statuses, resolutions, task view
settings (read and update), labels (list, add to and remove from a task),
assignable members, notifications (list, unread count, mark one or all
read), push device registration (register and unregister) and push
preferences (read and update). The types it uses (`Task`, `MyTask`, `MyProject`, …) are
aliases, in `src/core/api/types/index.ts`, of DTOs generated from the
backend's OpenAPI spec. Paged lists use the hand-written generic `Page<T>`,
because springdoc emits the list endpoints' 200 responses as `unknown`.

`HttpFluxApi` (`src/core/api/http-flux-api.ts`) is what `main.ts` provides
as `NETWORK_FLUX_API`, and inside `CachingFluxApi` as `FLUX_API` (see
[Offline](#offline)); only the write queue's replay uses it bare. It calls `environment.apiBaseUrl` (which ends in `/api/v1`, so paths are
written without it) and makes every request through
`AuthService.withAccessToken` (see below). `JsonHttpClient`
(`src/core/http/`) is the request (GET, POST, PUT, PATCH and DELETE), timeout,
query-string and JSON handling it shares with `AuthClient`. A `FormData` body
goes out as it is, with no `Content-Type` (fetch adds the boundary), and a
request may set its own timeout (uploads get 120 s). `src/core/mock/in-memory-flux-api.ts` is the
test double: its fixtures are dated relative to today and it applies the
my-tasks filters (including status, priority and search) and the project
list's filters (comma lists, assignee, labels, search) and sort, so page
specs use it (`addProjectTasks()` adds rows to page through). Its creates,
status changes, archiving and edits follow the backend's rules and error codes
(a PUT clears what it leaves out, as above), `done` is the closed
status and `todo` the default one. A created task is last in its board
column (position max + 1; a missing position counts as 0), and
`reorderTasks` follows the server's rules (400 when empty, 422
`TASK_REORDER_DUPLICATE_IDS` and `TASK_REORDER_MIXED_STATUS`) and renumbers
only the ids it's given. A project's task list also takes the
calendar's `dueDateFrom`/`dueDateTo` window (on the planned range, else the
due date) and `onlyUnscheduled`, with the server's 400s and its 100-row
page cap, and a PUT refuses a half or inverted planned range. CHK-131 is
planned for the three days around its due date. A created task is reported by Ada and
numbered after its project's highest key. CHK-142 has two attachments,
and uploads are Ada's, under the backend's default limits and 422s. A push
token registers to Ada, and unregistering one it doesn't hold is a 404
`DEVICE_TOKEN_NOT_FOUND`. Comments are written as Ada (`a1`, the page specs' account): only
she edits or deletes hers, a comment with replies can't be deleted, and
reactions toggle hers. Project p1 has five labels. CHK-142
carries the detail fixtures (Markdown description, parent, release, a
comment thread with a reply, reactions and an Editor.js body, a day-split
activity timeline, and bug fields detail doesn't show), and the EPIC
CHK-120 has two subtasks. Ada has nine notifications, three of them from
the last few hours and four unread (one a mention), covering mentions, an
assignment, a reaction "and 1 other", a release, a deleted task and a row
from before FM-42 with no actor or key. They filter by read state and a
`type` comma list (an unknown type is a 400 `INVALID_NOTIFICATION_TYPE`),
and marking one (a 404 `NOTIFICATION_NOT_FOUND` for an unknown id) or all
of them read changes the instance's list.

### Authentication

Staff sign in with their web credentials through flux-iam's
`POST /auth/login` (password grant; the app never talks to Keycloak). The
logic is plain TypeScript in `src/core/auth/`:

- `AuthClient` calls flux-iam (`login`, `refresh`, `getMe` for
  `/accounts/me`) over an injected `fetch`, with a 10 s timeout. Failures
  are `ApiError`s: `status` 0 means no response, and `body` is the backend's
  `ErrorResponse`, which is hand-written because springdoc doesn't emit it.
  Login always sends `rememberMe: true` (a Keycloak offline session: 30
  days idle, 1 year max); there is no checkbox.
- `AuthSession` holds the tokens and account and persists both through a
  `TokenStore` (the account is the last `/accounts/me`, saved after each
  load and kept through refreshes). On a cold start `restore()` refreshes
  an expired access token (they live 5 minutes), then loads the account. A
  4xx drops the session; no response or a 5xx keeps it, with the stored
  account, so being offline never signs anyone out.
- `AuthService.restore()` waits for `ConnectivityService.ready` (the first
  network check) and, offline, calls `restore({ offline: true })`: it
  sends nothing and signs in with the stored tokens and account at once,
  so the first screen isn't held up by a 10 s timeout. A session saved by
  an older version has no account, and stays without one until online.
  A stored account counts as stale: `resume()` fetches it again once the
  token is live, and `AuthService` calls `resume()` whenever `online` turns
  true.
- Refresh runs 30 s before expiry (a timer), on app resume (`resume()`,
  since timers stop while the app is suspended), and after a 401 with no
  error code. Concurrent callers share one refresh in flight. Only the
  refresh backs off on a transient failure (3 retries, full jitter, 2 s
  base, 30 s cap); the cold-start and logout refreshes try once.
- `withAccessToken(call)` is the base for every authenticated call (FM-5's
  real `FluxApi` wraps its requests in it). It hands `call` a live token,
  and on a bare 401 refreshes and retries once. It ends the session on a
  second 401, 401 `TOKEN_REVOKED`/`SESSION_EXPIRED`, 403
  `ACCOUNT_SUSPENDED` or 423 `ACCOUNT_LOCKED` (`endsSession()` in
  `api-error.ts`), keeping the server's `message` as `endedMessage` for the
  login page. Any other error, transient or not, goes back to the caller
  with the tokens kept, and a failed request is never replayed.
- `logout()` refreshes first if the access token has expired (flux-iam's
  `POST /auth/logout` needs a live one), calls it, then clears the store,
  even when the server call fails. Between the refresh and that call it
  runs the hook set with `setBeforeLogout()`, if the session is still live
  (push unregisters the device there); a hook that fails doesn't stop it.

`src/app/auth/` wraps this for Angular: `AuthService` exposes the state as
signals, opens `/login` whenever the session ends, and forwards Capacitor's
`resume` event. `authGuard` keeps signed-out users on `/login`, and
`guestGuard` sends signed-in users past it. Settings has the Log out item.
`TOKEN_STORE` is a `SecureTokenStore`
(`@aparajita/capacitor-secure-storage`: iOS Keychain with
`afterFirstUnlockThisDeviceOnly`, Android Keystore-encrypted storage) on
native, and an in-memory store on web, so a browser reload signs you out.
Never call the plugin on web: its web fallback is plain localStorage.

`capacitor.config.ts` enables `CapacitorHttp`, so on native `fetch` goes
through the native HTTP stack. The WebView's origins (`https://localhost`
on Android, `capacitor://localhost` on iOS) are therefore never subject to
the backend's CORS list, but these requests don't appear in the WebView
devtools Network tab.

It also configures `@capacitor/keyboard` with `resize: 'body'`, so the
body shrinks to the space above the keyboard and text fields (the edit
sheets) stay visible. `resizeOnFullScreen` is needed too, because the
Android WebView runs edge to edge. The settings reach the native projects
through `cap sync` (which `npm run android`/`ios` run).

### Biometric unlock

Opt-in from Settings, which shows the toggle only when the device has
biometrics enrolled (`@aparajita/capacitor-biometric-auth`). It only gates
local access to the stored session: the tokens and the server never see it.
The rule is plain TypeScript in `src/core/lock/`: `AppLock` locks on every
cold start and on a resume after `LOCK_TIMEOUT_MS` (5 minutes) in the
background. `src/app/lock/AppLockService` feeds it Capacitor's
`pause`/`resume` events from an app initializer (so a cold start is locked
before the first route renders), and ignores the pause caused by Android's
prompt, which runs in its own activity. `AppComponent` covers the app with
`LockScreenComponent` while locked and signed in, and makes the router
outlet `inert`. The prompt falls back to the device passcode, except on
Android 10 and lower (read from the WebView user agent). There the passcode
screen belongs to Settings (`ConfirmDeviceCredential`), which cancels the
app's check as it opens and then drops the accepted PIN (`onCDCASuccess
null!` in logcat, seen on a Redmi Note 8 Pro), so those phones get a
biometrics-only prompt. "Sign in with password" is `AuthService.logout()`.

- The setting lives in `@capacitor/preferences` (it isn't a secret) and is
  kept across logouts. Any sign-out also clears a pending lock, so a
  password sign-in never meets the lock screen.
- If biometrics are un-enrolled while the lock is on, it stands down rather
  than locking with an unusable prompt: removing them needs the device
  passcode anyway.
- Native only. On web the lock is never available and the plugins are never
  called.
- iOS needs `NSFaceIDUsageDescription` in `Info.plist` (present).

### Push

Push uses `@capacitor-firebase/messaging`, not
`@capacitor/push-notifications`: the backend sends through FCM for iOS too,
so iOS needs an FCM token rather than the raw APNs one. `PushService`
(`src/app/push/`, started from an app initializer) drives it.

- **Config files.** `google-services.json` (in `android/app/`) and
  `GoogleService-Info.plist` (in `ios/App/App/`) stay out of the repo
  (gitignored). `write-build-info.mjs` records which were present
  (`buildInfo.push`), and push is off on a platform built without its
  file, as on web: the plugin is never called. Without the file the
  plugin's token calls fail, and the card would ask for a permission that
  can't deliver anything. Adding or removing a file takes a web rebuild
  (`npm run android`/`ios` do one). The Gradle google-services plugin is
  applied only when the json exists, and iOS copies the plist into the app
  in a build phase ("Copy GoogleService-Info.plist if present"), because a
  Resources entry for a missing file fails the build. The release
  workflows write both files from secrets before the web build (see
  [§9 Push in release builds](#push-in-release-builds)). The local backend
  sends pushes only with `flux.push.fcm.service-account-base64` set.
- **Permission** is never asked at launch. The Inbox shows a "Get notified
  on your phone" card (`app-push-card`) while the OS would still prompt
  (`prompt`/`prompt-with-rationale`) and the card hasn't been dismissed.
  Only its button and the Notifications page's Turn on (below) call
  `requestPermissions()`. The dismissal is kept in
  `@capacitor/preferences` (`push.cardDismissed`) across logouts. Once
  permission is granted or denied the card is gone (Android 12 and lower
  grant without asking), and it's checked again on resume, for a change
  made in the OS settings.
- **Registration** follows `PushRegistration` (`src/core/push/`). Once
  there's a token and a signed-in account it sends `PUT /push/devices`
  (`platform`, `appVersion` = the package version, cut to 32), and again
  for a new token (`tokenReceived`), another account, or a new launch. The
  server moves a token to whoever registered it last. A failure is retried
  on the next of those, and calls run one at a time.
- **Logout** unregisters (`POST /push/devices/unregister`) through
  `AuthSession.setBeforeLogout()`, before flux-iam's logout, which revokes
  the access token at once and leaves device tokens alone. A 404
  `DEVICE_TOKEN_NOT_FOUND` or no response is ignored. A session the server
  ends can't unregister; FCM's pruning and the next sign-in's registration
  cover that.
- **Settings.** Settings → Notifications (`/tabs/my-work/settings/notifications`,
  `src/app/pages/notification-settings/`) shows the OS permission from
  `PushService.permission`: Turn on (`enable()`) while the OS would still
  prompt, Open settings once it's denied, or that push is only on the phone
  apps (web) or not set up in this build. Open settings is
  `capacitor-native-settings` with `AppNotification`, the app's own
  notification screen. PushService's resume check updates the page after a
  trip there.
  - On Android 12 and lower the messaging plugin's `checkPermissions()` and
    `requestPermissions()` answer `granted` without checking, so turning
    notifications off in Settings would never show. On Android, a `granted`
    is checked against the app's own `NotificationState` plugin
    (`NotificationStatePlugin.java`, registered in `MainActivity`;
    `NotificationManagerCompat.areNotificationsEnabled()`), and reads as
    `denied` when they're off.
  - Under that are the caller's push preferences
    (`GET`/`PATCH /push/preferences`, stored per account on the server, so
    they follow it to every phone). `PUSH_PREFERENCE_SECTIONS`
    (`src/core/push/`) puts the 11 types under 7 plain names, e.g. Mentions
    is `MENTION` and `DESCRIPTION_MENTION`. A group is on while any of its
    types is, and a change writes all of them. A type the app doesn't know
    gets no toggle.
  - A toggle applies at once and PATCHes only its types. The response isn't
    applied, so a toggle saved meanwhile isn't undone; a failure puts back
    that group and toasts the server's message.
  - The toggles are disabled until permission is granted. They only filter
    pushes: the Inbox still lists everything, and the page says so.
- **Android.** Pushes go to the "Task updates" channel (`task_updates`,
  default importance), which `PushService` creates and `AndroidManifest.xml`
  names as FCM's default. `POST_NOTIFICATIONS` comes from the plugin's
  manifest. There's no monochrome notification icon yet, so the status bar
  draws the launcher icon.
- **iOS.** `AppDelegate` forwards the APNs token and background pushes to
  the plugin, and `Info.plist` has `UIBackgroundModes` `remote-notification`.
  Debug signs with `App/App.entitlements` (`aps-environment` development)
  and Release with `App/App.Release.entitlements` (production), which the
  "Flux App Store" profile's Push capability allows. The SPM package needs `symlink: true`
  (`capacitor.config.ts`). `cap sync` then creates the gitignored
  `CapApp-SPM/symlinks/`, which fails on Windows without Developer Mode
  (EPERM), so edit `Package.swift` by hand there.
- The plugin's web implementation imports the optional `firebase` package,
  which isn't installed: `angular.json` lists `firebase/messaging` in
  `externalDependencies`, and that lazy chunk never loads, since push never
  calls the plugin on web.
- **Opening.** `PushOpenService` (`src/app/push/`, its own app
  initializer) listens for taps. The plugin keeps a cold start's tap until
  that listener is added.
  - `parsePushData()` and `pushTarget()` (`src/core/push/`) read the data
    (`notificationId`, `type`, and `entityType`, `entityId`, `projectId`
    when set). A TASK push other than TASK_DELETED with both ids opens the
    task; a release, a deleted task or a missing id opens the Inbox. For
    comments, mentions and reactions the task opens, not the comment.
  - A tap waits until the session is restored and the lock is passed. With
    no one signed in it's dropped, so a later sign-in opens nothing.
  - It goes back to `/tabs/inbox` (no animation), then pushes
    `/tabs/inbox/tasks/:p/:t`. A tab switch is always a back navigation
    in Ionic, so pushing the task straight from another tab would leave it
    alone on the Inbox stack, and Android's Back would leave the app.
  - It marks the notification read (`PATCH`, a 404 ignored), then
    refreshes the counts and calls `InboxService.listsChanged()`, which
    makes a loaded Inbox page reload its opened segments.
- **Foreground.** Android never shows a push while the app is open, and
  iOS is told not to (`presentationOptions: []` in `capacitor.config.ts`).
  `notificationReceived` refreshes the counts
  and the Inbox, and shows a 5 s toast at the top of the screen (the push's
  title as its header, then its body) with Open, which opens it as a tap
  does. At the top it can't meet the Undo toast, the tab bar or task
  detail's docked bar. A newer push replaces it.

### Regenerating API types

`npm run api:generate` rewrites `src/core/api/generated/` from two specs,
one folder each (`@hey-api/openapi-ts`, types only; config in
`openapi-ts.config.ts`):

| Service         | Spec                                | Output                 |
| --------------- | ----------------------------------- | ---------------------- |
| flux-operations | `http://localhost:9003/v3/api-docs` | `generated/operations` |
| flux-iam        | `http://localhost:9001/v3/api-docs` | `generated/iam`        |

The output is committed, so builds and CI never need a running backend.
Regenerate and commit whenever the backend contract changes — type errors
that follow are real contract drift. Never hand-edit `generated/` (it is also
eslint-ignored).

Both services must be running, with springdoc's api-docs enabled: the two
jobs run in parallel and each wipes its own folder, so a run with one
service down leaves a half-regenerated tree (check `git status`). Use the
docker dev stack from the `flux` backend repo, whose `dev` profile has
api-docs on — not `run-local-prod.sh`, which uses the production database:

```bash
bash scripts/start-local.sh
```

Every generated response property is optional: springdoc only marks
validated request fields (e.g. `LoginRequest.email`) as required, and the
backend nulls out fields a user's role may not see. Check for missing
fields rather than trusting the types (see `AuthSession`'s token check).

## 5. Run commands

Install once: `npm install`.

| Platform | Command                           | Notes                                                                                                                                                                                                                                                                                                            |
| -------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web      | `npm start` (alias `ionic serve`) | Opens `http://localhost:8100`, dev environment                                                                                                                                                                                                                                                                   |
| Android  | `npm run android`                 | Dev environment. Needs `ANDROID_HOME` set and an AVD (or a device). Run once from Android Studio if `local.properties` hasn't been generated yet.                                                                                                                                                                |
| iOS      | `npm run ios`                     | Dev environment. **macOS only.** Needs Xcode 26+. Run `npx cap sync ios` first if native files changed. Simulator runs need no Apple Developer account; a physical device or archive build does. Without a Mac, the `iOS simulator` CI workflow (see [§9 CI](#9-ci)) builds and launches the app on a simulator. |

Each platform also has `:staging` and (Android/iOS only) `:prod` variants,
e.g. `npm run android:staging`, `npm run ios:prod`, `npm run start:staging`
— see [§6 Environments](#6-environments).

Other useful commands: `npm test` (Vitest), `npm run test:coverage` (Vitest with coverage — writes a text summary plus `coverage/index.html` and `coverage/lcov.info`, no enforced threshold), `npm run lint` / `npm run lint:fix` (ESLint), `npm run format` / `npm run format:check` (Prettier), `npm run build` (production web build to `www/`, alias `npm run build:staging`/`build:dev` for the other environments), `npm run sync` (`ionic cap sync`, copies web build into both native projects — builds production), `npm run api:generate` (regenerate API types from the running backend — see [§4](#4-api-layer)).

### Reaching the local backend

Sign-in talks to flux-iam at `iamBaseUrl` (dev: `http://localhost:9001`),
and everything else to flux-operations at `apiBaseUrl` (dev:
`http://localhost:9003`), both run with the flux repo's
`scripts/start-local.sh`.

- **Web** (`npm start`, origin `http://localhost:8100`): the CORS list only
  has `http://localhost:4200` by default. In the flux repo, set
  `CORS_ALLOWED_ORIGINS=http://localhost:4200,http://localhost:8100` in
  `.env` (what the containers read, and both services use it; also in
  `.env.local`, which `start-local.sh` copies to `.env` when `.env` is
  missing), then recreate both services so they pick up the change —
  `docker restart` keeps the old environment:
  `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d flux-iam flux-operations`.
- **Android** (emulator or USB phone): forward the ports so the device's
  `localhost` is your machine's, then run the dev build:
  `adb reverse tcp:9001 tcp:9001` and `adb reverse tcp:9003 tcp:9003`.
  Debug builds allow cleartext http
  (`android/app/src/debug/AndroidManifest.xml`); release builds don't.
- **iOS simulator**: shares the Mac's `localhost`. A Debug-only build phase
  ("Allow local HTTP in Debug") adds `NSAllowsLocalNetworking` to the built
  `Info.plist`; Release builds never carry it.

To reproduce what CI runs on a PR locally, run `npm run format:check`, `npm run lint`, `npm test -- --configuration=ci` and `npm run build` — see [§9 CI](#9-ci).

## 6. Environments

`src/environments/environment.ts` (dev), `environment.staging.ts` and
`environment.prod.ts` hold the API URLs for each backend (`AppEnvironment` in
`environment.model.ts`); `angular.json`'s `staging`/`production`/`development`
build configurations pick which one is compiled in via `fileReplacements`.
Staging URLs are still `example.com` placeholders, mirroring the same gap in
the `flux-web` repo.

`scripts/write-build-info.mjs` generates a gitignored
`src/environments/build-info.ts` (app version, short git commit, any
`FLUX_*` environment variable, and which Firebase config files exist) before every build/serve/test — see the
`ionic:build:before` / `ionic:serve:before` / `pre*` scripts in
`package.json`. This is the only place environment-specific values are
injected; nothing is hardcoded and nothing here is committed. Since anything
shipped in a mobile bundle can be extracted, only put client-side keys here
(e.g. a Sentry DSN) — never a real server secret.

The About page shows the active environment name and the build version.
`webBaseUrl` is flux-web's origin, used by task detail's Copy link.
`privacyPolicyUrl` is a placeholder (`https://example.com/privacy`) in all
three files until the store release supplies the real page.

## 7. Theme

Edit `src/theme/tokens.scss` only — it's the single source of design tokens,
copied from the handoff ([§8](#8-design-mockups)): the Radix gray, indigo and
status hue scales, surfaces, avatar fills, shadows, radii, spacing, and the
type scale. A value is either shared or a `(light: …, dark: …)` pair.

`src/theme/variables.scss` derives everything else from it; don't put values
there:

- **`--flux-*` variables**, named after the handoff's tokens: `--flux-n12`
  (gray 12), `--flux-na3` (gray alpha 3), `--flux-p9` / `--flux-pa3`
  (indigo), `--flux-red11` / `--flux-reda3` (hues), `--flux-bg` /
  `--flux-panel` / `--flux-surface`, `--flux-shadow-card`,
  `--flux-radius-card`, `--flux-space-16`, `--flux-avatar-1` to `-6`.
  Components style themselves with these only — never a literal colour or
  spacing value.
- **Type roles** as `font` shorthands plus letter-spacing:
  `font: var(--flux-font-row-title); letter-spacing: var(--flux-tracking-row-title);`.
- **Ionic's variables**: the `--ion-color-*` palette (primary is indigo 9),
  background, text and their stepped series, and the item, toolbar, tab bar
  and card backgrounds, plus `--ion-font-family` and `--ion-padding` /
  `--ion-margin` (16px).

Dark mode follows the OS setting unless Settings overrides it: light values
sit on `:root`, and the `dark-scheme` mixin's dark ones override them under
`prefers-color-scheme: dark` (unless `<html>` has `flux-theme-light`) or
whenever `<html>` has `flux-theme-dark`. `ThemeService` (`src/app/theme/`)
sets those classes from the choice (System sets neither), keeps it in
`@capacitor/preferences` (`theme`, on this device only and across logouts,
since the account has no theme field), and applies it from an app
initializer before the first screen. A component can't see the class through
its style encapsulation, so a scheme-dependent component value is a variable
set in both places instead of its own media query (`--flux-segment-checked`,
the tab badge ring's `--ion-tab-bar-background`, `--flux-primary-text`). Ionic's own dark palette is
not imported, because it would override the tokens. On Android the app theme
sets `android:forceDarkAllowed` to false (`styles.xml`): MIUI's dark mode for
apps otherwise darkens the WebView's output, so Light showed dark and the dark
tokens were re-darkened (seen on a Redmi Note 8 Pro). MIUI still dims a light
app's whole screen a little in dark mode; that's the system's, not the app's.

**Contrast** (FM-55). Text meets WCAG AA, 4.5:1 against its own background
(an a3 pill over `--bg` or `--panel` included), in light and dark; icons
need 3:1. The handoff claims this but its values don't all reach it, so
these differ from it, each darkened just enough and noted in `tokens.scss`
(dark values are unchanged):

| Token                                    | Handoff                                           | Now                                               | Why                                     |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| amber, green, blue, red, cyan 11 (light) | `#ab6400` `#218358` `#0d74ce` `#ce2c31` `#107d98` | `#a15e00` `#1f7a52` `#0c6bbf` `#c72a2f` `#0f7690` | 3.97–4.46:1 on their a3 washes          |
| red 9                                    | `#e5484d`                                         | `#d34247`                                         | white badge and Archive text was 3.91:1 |
| avatar teal, pink, cyan, orange          | `#12a594` `#d6409f` `#00a2c7` `#f76b15`           | `#0e8577` `#cb3d97` `#00819e` `#c45511`           | white initials were 2.97–4.12:1         |

And in how tokens are used:

- `--na10` is for icons only; text that 3a–3n set in `--na10` (3.9–4.2:1)
  uses `--na11`.
- Placeholders are `--na11` at full opacity (`--ion-placeholder-color`,
  `--ion-placeholder-opacity`), not `--n9`/`--na9` (3.3:1).
- `--flux-primary-text` is indigo 9 in light and 11 in dark, where 9 is
  3.1–3.6:1. Ionic's primary-coloured text uses it (`global.scss`: the back
  button, clear buttons, toast and alert buttons); fills stay indigo 9.
- The inactive tab label is `--na11` (`--ion-tab-bar-color`); Ionic's
  default was 4.36:1.
- The calendar dims weekends and other months' days with a wash
  (`--na1`, `--na2`) rather than a `--na8` number (1.9:1), and the status
  sheet's blocked reason is `--na11`.

Exempt: the `·` separators (`--na7`, decorative) and a disabled status
row's name (`--na8`, inactive).

`src/theme/typography.scss` bundles Inter and CommitMono (from
`src/theme/fonts/`), sets the body text defaults, and defines the
`.flux-screen-title` class for tab-root titles. Icons are the handoff's
Lucide set: `registerFluxIcons()` (`src/app/icons/`, called in `main.ts` and
the test setup) registers all of them with ionicons, so templates use
`<ion-icon name="list-todo">`. The status bar's text follows the theme in
effect (`ThemeService.dark`, through `StatusBarService`, native only); on Android the WebView runs edge to edge.
So do the navigation bar's buttons (Capacitor's `SystemBars`, FM-56):
Android's own theme follows the OS, so Light over a dark OS left light
buttons on the white tab bar. The create sheet's forced light status bar
text doesn't apply to them.

**Surfaces and specificity** (FM-56):

- Cards (task detail's, the board's, comment bubbles) and sheets
  (`ion-modal.flux-sheet`, the create sheet, `sheet.scss`) are on
  `--surface`, not `--bg`: the same white in light, a step up from the
  `--panel` canvas in dark (3n). Headers and docked bars stay `--bg`. A
  field on a sheet is filled with `--na3`, not `--n3`, which is the same
  colour as dark `--surface`.
- `global.scss`'s primary colour for clear buttons is wrapped in
  `:where()`, so a page's own `--color` wins (the header icons' `--na11`).
  Ionic's toolbar rules outrank a plain class too: an outline button in a
  toolbar draws its border in its text colour, and
  `ion-buttons ion-button` has a 4px radius; Inbox's Mark all read beats
  them with `ion-buttons ion-button.mark-all` and `::part(native)`.
- Ionic pads every toolbar in a modal by 8px
  (`html.ios ion-modal ion-toolbar`), so a sheet's toolbar sets 8px of its
  own for the 16px gutter.
- Segmented controls are a 36px track (`--flux-radius-segmented-track`,
  11px) with the 30px chip 3px in, and full width.

Text follows the OS text size (iOS Dynamic Type, Android's font size) up to
120%, as the handoff asks. `variables.scss` multiplies every type role's size
and line height by `--flux-text-scale` (1 by default), except a role marked
`fixed: true` in `tokens.scss` (the calendar's 9.5px pills, whose day is a
seventh of the screen wide). `typography.scss` sets `<html>`'s font size from
it too, so Ionic's own rem-based text (toasts, searchbars, the back button)
follows: the browser's default size times the scale, or 17px on iOS, where
Ionic's `typography.css` sets `font: -apple-system-body` and would otherwise
follow Dynamic Type with no limit. `TextScaleService` (`src/app/text-scale/`,
an awaited app initializer, again on resume) reads
`@capacitor/text-zoom`'s `getPreferred()`, clamps it with `textScale()`
(`src/core/text-scale/`, 1 to 1.2) and sets the variable on `<html>`. Native
only; on web it stays 1. iOS's plugin has only `getPreferred()` (the body
style's size ÷ 17). Android's WebView scales px text by the font size on its
own, without a limit, so the service first pins its text zoom to 1 with
`TextZoom.set()`. Changing Android's font size restarts the activity
(`fontScale` isn't in `configChanges`), so the app reads it at launch.

So text can grow: style text with the roles, and give a box that holds text
a `min-height` rather than a `height`. A pill whose text is centred by a
`line-height` equal to its height scales that line height
(`calc(22px * var(--flux-text-scale))`), and so do values counted in lines
of text (the composer's height cap; the description's `--rich-text-line` is
in `em` instead). A fixed height is fine where the text still fits at 120%,
as in Ionic buttons and chips and task detail's 22px chips. Avatar circles,
icons, the board's 296px columns and the calendar drawer's 0.08 stop stay
fixed; the initials and the drawer's head fit at 120%. To
check a screen on web, set `--flux-text-scale` to 1.2 on `<html>` from the
console.

## 8. Design mockups

The current design is the Claude Design handoff in
[`docs/design/mobile-v2/`](docs/design/mobile-v2/README.md) (see
[`docs/design/README.md`](docs/design/README.md)). Its README is the spec:
tokens, screens `3a`–`3n`, and an Ionic component mapping to follow. Recreate
screens with Ionic primitives; never port its `support.js` runtime or inline
styles. When a design changes a token value, update `src/theme/tokens.scss`.
To compare a screen, `.claude/launch.json`'s `design-handoff` serves the
folder on `localhost:8200`; the phone frames are 390px wide, the screen
starting 44px into each.

## 9. CI

`.github/workflows/ci.yml` runs on every pull request: a single `verify` job
on Node 22 / npm 12, with `actions/setup-node`'s npm cache keyed on
`package-lock.json` so a typical run installs in a few minutes. Steps, each
reproducible locally:

| Step   | Command                                |
| ------ | -------------------------------------- |
| Format | `npm run format:check`                 |
| Lint   | `npm run lint`                         |
| Test   | `npm test -- --configuration=ci`       |
| Build  | `npm run build` (production web build) |

Any failing step fails the job. The `main: require CI` ruleset (repo
Settings → Rules) requires the `verify` check to pass on `main`, with no
bypass actors, so a PR can't merge while CI is red. It also rejects a direct
push to `main` unless that commit has already passed `verify`, so land
changes through pull requests.

Native builds aren't part of this workflow. An ad-hoc-signed iOS simulator build,
a signed Android release build and a signed iOS release build (with
TestFlight upload) each run in their own workflow (below).

### iOS simulator

`.github/workflows/ios-simulator.yml` runs a separate `ios-simulator` job on
a `macos-26` runner (Xcode 26.6 by default), to build and launch the app on
an iOS simulator without a Mac. It triggers on pull requests that touch
`ios/**`, `capacitor.config.ts`, `package.json`, `package-lock.json`,
`scripts/ci/**`, or the workflow file itself, and on manual
`workflow_dispatch` runs. It is **not**
a required check — a path-filtered check can never complete on PRs that skip
it, which would leave them permanently unmergeable under `main: require CI`.

Steps: `npm ci`, `npm run build:dev`, `npx cap sync ios`, then `xcodebuild`
for the `App` scheme's Debug configuration against `-sdk iphonesimulator`
signed ad hoc (`CODE_SIGN_IDENTITY=-`, "Sign to Run Locally", which needs no
Apple account). Don't switch it to `CODE_SIGNING_ALLOWED=NO`: an unsigned
app has no entitlements, so the simulator refuses its Keychain writes and
sign-in fails. It then boots an iPhone 17 simulator, installs and launches the app
(`asia.justflux.mobile`), and confirms the process is still running 20
seconds later (`ps` plus `simctl spawn launchctl list`) rather than just
checking that `simctl launch` returned.

It then checks iOS swipe-back. `scripts/ci/mock-iam.mjs` stands in for
flux-iam on `localhost:9001` (the dev build's `iamBaseUrl`; any credentials
sign in as a fixed test account), `scripts/ci/mock-operations.mjs` for
flux-operations on `localhost:9003` (one project, `CI`, with its
workflow statuses (one closed) and three tasks dated around today, so My
Work and the Projects list have rows; CI-1 has a comment thread and
activity, and the Inbox three notifications, so the design screenshots
below aren't empty states; it answers GETs only), and
`scripts/ci/ios-swipe-back.sh` drives
the simulator with [idb](https://fbidb.io/) (`idb-companion` from Homebrew,
`fb-idb` on Python 3.11). It signs in, opens the first task on the Projects
tab, and swipes from the left edge. idb can't see inside the WebView (its
accessibility tree stops at the app), so the script taps fixed points on the
iPhone 17 and judges the result from screenshots with Pillow, ignoring the
top 180 pt, where the clock and iOS's own banners (once "Ready for Apple
Intelligence") change on their own. Sign-in must
reach the mock IAM (checked in its log). After each tap or swipe the script
polls screenshots for up to 45 s, because idb can deliver input ~15 s late
on a slow runner: switching to Projects must change over 2% of pixels,
opening the task over 20%, and the swipe must bring the screen back to within
2% of the list. Detail changes about 35%. The limit stays well above the
~7% of the tapped row's pressed highlight, which can hold still while a slow
runner loads the detail page; at 5% the script once swiped on the list
before detail opened. Moving the login fields, the tab bar or the Projects list's
first row means updating the points at the top of the script.

`scripts/ci/ios-large-text.sh` then sets the simulator to the largest
standard text size (`simctl ui content_size extra-extra-extra-large`, which
the app caps at 120%, see [§7](#7-theme)), relaunches the app (still signed
in) and screenshots My Work, the Projects list and the first task, at the
same tap points. Those screenshots are for review: the step fails only if the
app doesn't load My Work again or stops running.

`scripts/ci/ios-design-screens.sh` (FM-56) then relaunches the app with
the simulator in light, then dark (`simctl ui appearance`), and screenshots
the handoff's screens for comparison with `docs/design/mobile-v2/`:
`design-<light|dark>-<id>-<screen>.png` for My Work (3a), the Projects list
(3b), board (3c), calendar (3d), task detail's three tabs (3e–3g), the
status (3h), create (3i), switcher (3j) and overflow (3n) sheets, the Inbox
(3l) and Settings. It reaches each by fixed tap points measured on web at
402×874 with the iPhone's 62 pt and 34 pt safe areas, and a screen that
doesn't open is only a warning. All three scripts share
`scripts/ci/sim-helpers.sh` (tap, screenshot, the pixel difference, settle
and wait). The job's timeout is 60 minutes; runs took 20–30 before this
step.

Screenshots (`my-work.png`, `list.png`, `detail.png`, `after-swipe.png`,
`large-text-my-work.png`, `large-text-projects.png`, `large-text-detail.png`,
the `design-*.png` set and the final `flux-ios-simulator.png`) are uploaded
as one artifact on every run; the simulator's app log and both mock logs
only if the job fails.

### Android signed build

`.github/workflows/android-release.yml` produces a signed Android build for
testers. It runs **only on manual `workflow_dispatch`** (Actions → Android
release → Run workflow, or
`gh workflow run android-release.yml -f configuration=production`), with a
`configuration` input of `production` (default) or `staging` (staging API
URLs are still placeholders — see [§6](#6-environments)).

Steps: `npm ci`, writing `android/app/google-services.json` from its secret
(see [Push in release builds](#push-in-release-builds)), the web build for
that configuration (which fails if `build-info.ts` has push off for Android),
`npx cap sync android`, then `./gradlew bundleRelease assembleRelease` on
JDK 21. It checks that the
APK verifies with `apksigner` and the AAB with `jarsigner`, writes the signing
certificate's SHA-256 to the job summary, and uploads
`flux-<configuration>-<version>-<versionCode>.apk` and `.aab` as one
`android-release` artifact (kept 30 days). Install the APK on a device with
`adb install -r <apk>`.

**Versioning.** `versionCode` is the workflow's `github.run_number`, and
`versionName` is `package.json`'s `version` plus the run number, e.g.
`0.0.1 (42)`. Both are passed as `-PfluxVersionCode` / `-PfluxVersionName`;
`android/app/build.gradle` falls back to `1` / `1.0` for local builds.
`run_number` restarts at 1 if the workflow file is renamed or recreated — if
that ever happens, add an offset so `versionCode` keeps increasing, or
installed builds won't accept the update.

**Secrets.** The job uses the `android-release` GitHub Environment (repo
Settings → Environments), which must hold five secrets:
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD` and `ANDROID_GOOGLE_SERVICES_JSON_BASE64` (see
[Push in release builds](#push-in-release-builds)). The job fails fast with
a clear message if any is missing. The keystore is decoded into the runner's temp directory and handed
to Gradle as `ANDROID_SIGNING_*` environment variables for that one step.
Never give a signing variable a `FLUX_` prefix: `write-build-info.mjs` copies
every `FLUX_*` variable into the app bundle (see [§6](#6-environments)).
Without `ANDROID_SIGNING_STORE_FILE`, a local `assembleRelease` still works
and produces an unsigned `app-release-unsigned.apk`. `*.jks` and `*.keystore`
are gitignored under `android/`.

**Creating the keystore.** Done once, outside CI, by someone with authority
over company credentials (the key must be company-owned, not tied to a
developer's account):

1. `keytool -genkeypair -v -storetype PKCS12 -keystore flux-release.jks -alias flux -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=CedValley, OU=Flux Mobile, O=CedValley, L=Subang Jaya, ST=Selangor, C=MY"`
   (PKCS12 uses the store password as the key password, so the two secrets
   hold the same value). Always pass `-dname` with company-only fields:
   without it, keytool prompts for "first and last name", and that answer
   is baked into the certificate for the key's whole life, visible to anyone
   who inspects the APK. Check the `Owner:` line with
   `keytool -list -v -keystore flux-release.jks -alias flux` before
   uploading.
2. Store the `.jks` file and its password in the company password vault.
   Losing it means installed builds can never be updated.
3. `base64 -w0 flux-release.jks` and save the output as
   `ANDROID_KEYSTORE_BASE64`, plus the password (twice) and alias `flux`, in
   the `android-release` Environment. Optionally add required reviewers there.

When Play Store upload is added, this key becomes the Play App Signing
**upload key**.

### iOS release

`.github/workflows/ios-release.yml` produces a signed App Store build and
uploads it to TestFlight. It runs **only on manual `workflow_dispatch`**
(Actions → iOS release → Run workflow, or
`gh workflow run ios-release.yml -f configuration=production`), with a
`configuration` input of `production` (default) or `staging`, and an `upload`
boolean (default `true`; `-f upload=false` builds and signs without
uploading).

Steps on a `macos-26` runner: `npm ci`, writing
`ios/App/App/GoogleService-Info.plist` from its secret (see
[Push in release builds](#push-in-release-builds)), the web build for that
configuration (which fails if `build-info.ts` has push off for iOS),
`npx cap sync ios`, then the signing certificate is imported into a temporary
keychain and the provisioning profile installed. `xcodebuild archive` builds
the `App` scheme's Release configuration, and `xcodebuild -exportArchive`
exports an `.ipa` using `ios/App/ExportOptions.plist`. The job checks with
`codesign` that the app is signed by an Apple Distribution certificate for
team `44UNNHB3V6`, that its version and build number are the expected
ones, and that it carries `GoogleService-Info.plist` and is signed with
`aps-environment` production. It writes these to the job summary, and uploads
`flux-<configuration>-<version>-<buildNumber>.ipa` as an `ios-release`
artifact (kept 30 days). If `upload` is set, `xcrun altool --upload-app`
sends it to App Store Connect; the build then appears under TestFlight once
Apple finishes processing. The keychain, profile and API key are removed at
the end of every run.

**Signing settings.** The App target's **Release** config uses manual
signing: `DEVELOPMENT_TEAM = 44UNNHB3V6`, identity `Apple Distribution`,
profile `Flux App Store`, entitlements `App/App.Release.entitlements`
(`aps-environment` production; in `project.pbxproj`, and the team ID is also
in the workflow's `APPLE_TEAM_ID`). Debug keeps automatic signing, so simulator and
device runs from Xcode or `npm run ios` are unaffected. These settings live
in the target rather than on the `xcodebuild` command line, where they would
also apply to the Capacitor Swift package targets and break the build.
`Info.plist` sets `ITSAppUsesNonExemptEncryption` to `false` (the app only
uses HTTPS), so TestFlight doesn't hold each build for an export compliance
answer.

**Versioning.** `CFBundleShortVersionString` is `package.json`'s `version`
and `CFBundleVersion` is the workflow's `github.run_number`, passed as
`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`; the project file's `1.0` /
`1` are only local fallbacks. This is the Android scheme, except that iOS
doesn't allow the `0.0.1 (42)` display form in the version string. Run
numbers are per workflow, so an iOS build number and an Android
`versionCode` for the same commit can differ. As with Android, if the
workflow file is renamed or recreated, add an offset so the build number
keeps increasing, or App Store Connect will reject the upload.

**Secrets.** The job uses the `ios-release` GitHub Environment, which must
hold seven secrets: `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD`,
`IOS_PROVISIONING_PROFILE_BASE64`, `APP_STORE_CONNECT_API_KEY_ID`,
`APP_STORE_CONNECT_API_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_P8_BASE64` and
`IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64` (see
[Push in release builds](#push-in-release-builds)).
The job fails fast with a clear message if any is missing. The same rule as
Android applies: never give a signing variable a `FLUX_` prefix. `*.p12`,
`*.cer`, `*.mobileprovision` and `*.p8` are gitignored repo-wide.

**Creating the signing assets.** Done once, outside CI, by someone with
access to the Apple Developer account (team `44UNNHB3V6`). That team is an
**Individual** membership rather than an Organization one, a deliberate
choice: its certificates carry the account holder's name instead of
CedValley's, which is embedded in every build and would appear as the App
Store seller. Moving to an Organization team later means a new Team ID
(`DEVELOPMENT_TEAM` in `project.pbxproj`, `APPLE_TEAM_ID` in the workflow)
and redoing these steps. No Mac is needed; the
`openssl` commands work in Git Bash. Run them in a folder **outside the
repo** (e.g. `mkdir -p ~/flux-signing && cd ~/flux-signing`), move the files
you download from Apple into it, and delete it once everything is in the
vault: the private key must never end up in a commit.

1. In the Apple Developer portal, register an explicit App ID for
   `asia.justflux.mobile` (Certificates, Identifiers & Profiles →
   Identifiers).
2. Create a private key and certificate signing request, using a company
   email address:
   `openssl genrsa -out flux-distribution.key 2048` then
   `MSYS_NO_PATHCONV=1 openssl req -new -key flux-distribution.key -out flux-distribution.csr -subj "/emailAddress=<company email>/CN=CedValley/C=MY"`.
   `MSYS_NO_PATHCONV=1` stops Git Bash from rewriting the `/`-prefixed
   `-subj` value into a Windows path (`C:/Program Files/Git/emailAddress=…`),
   which `openssl` rejects; drop it on macOS or Linux.
   Upload the CSR under Certificates → + → **Apple Distribution**, and
   download `distribution.cer` into the same folder.
3. Build the `.p12`:
   `openssl x509 -inform DER -in distribution.cer -out distribution.pem` then
   `openssl pkcs12 -export -legacy -inkey flux-distribution.key -in distribution.pem -out flux-distribution.p12`.
   `-legacy` matters: the macOS keychain can't import a `.p12` made with
   OpenSSL 3's default encryption.
4. Under Profiles → +, create an **App Store Connect** distribution profile
   for that App ID and certificate, named exactly `Flux App Store`, and
   download it.
5. In App Store Connect, create the app record for the bundle ID
   (Apps → + → New App).
6. In App Store Connect → Users and Access → Integrations → App Store Connect
   API, create a team key with the **App Manager** role. Download the `.p8`
   (it can only be downloaded once) and note the Key ID and Issuer ID.
7. Store the key, `.p12` and its password, profile and `.p8` in the company
   password vault.
8. `base64 -w0` the `.p12`, `.mobileprovision` and `.p8`, and save them with
   the `.p12` password, Key ID and Issuer ID as the six signing secrets in the
   `ios-release` Environment. Optionally add required reviewers there.
9. In App Store Connect → TestFlight, create an internal testing group and
   add testers. They install builds with the TestFlight app on their device.

**Renewal.** The distribution certificate and the profile expire after a
year. Create a new certificate (steps 2–3), regenerate the profile under the
same name `Flux App Store` (step 4), and replace the three affected secrets.
The profile takes its capabilities from the App ID, so it keeps Push.

### Push in release builds

Both release workflows write the Firebase config (see Push in
[§4](#push)) from a secret before the web build, so `write-build-info.mjs`
turns push on, and fail fast when the secret is missing, doesn't decode, or
is for another app. The files aren't server secrets (they ship inside every
build), but they stay out of the repo like the rest of the signing
material. Both apps live in the Firebase project `flux-web-469d3` (shared
with flux-web), which every configuration uses, so each platform has one
secret.

| Environment       | Secret                                 | File                                   |
| ----------------- | -------------------------------------- | -------------------------------------- |
| `android-release` | `ANDROID_GOOGLE_SERVICES_JSON_BASE64`  | `android/app/google-services.json`     |
| `ios-release`     | `IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64` | `ios/App/App/GoogleService-Info.plist` |

**Setting it up.** Done once, by someone with access to the Apple Developer
account, the Firebase console and the vault. Steps 1–4 come before the iOS
workflow's next run: the Release entitlements ask for `aps-environment`, and
a profile without Push fails the archive.

1. In the Apple Developer portal, under Identifiers → `asia.justflux.mobile`,
   enable **Push Notifications**. Skip its SSL certificates: the key below
   replaces them.
2. Under Keys → +, create a key with **Apple Push Notifications service
   (APNs)** for Sandbox & Production. Download the `.p8` (it can only be
   downloaded once), note its Key ID, and store both in the vault.
3. In the Firebase console (`flux-web-469d3`):
   - Project settings → General → Add app → iOS, bundle ID
     `asia.justflux.mobile`, and download `GoogleService-Info.plist`. The
     Android app is already registered there; its `google-services.json`
     is under the same page.
   - Project settings → Cloud Messaging → Apple app configuration: upload
     the `.p8` as the APNs authentication key, with its Key ID and team
     `44UNNHB3V6`. One key serves development and production.
4. Under Profiles, edit `Flux App Store`, save it to regenerate it with
   Push, download it, and replace `IOS_PROVISIONING_PROFILE_BASE64` with its
   `base64 -w0`.
5. `base64 -w0` both Firebase files and save them as the two secrets above.
   Like every secret here, never with a `FLUX_` prefix.

Production sends pushes only once its backend has
`FIREBASE_SERVICE_ACCOUNT_BASE64` set in `.env.production`, a backend
deploy step outside this repo. On the host, that file renders into
`/etc/flux/operations.env` (`04-env-install.sh`, then restart
`flux-operations.service`); the flux repo's deploy workflow only ships jars
and never writes it.

When pushes don't arrive but the Inbox row does:

- **Neither platform gets them:** the backend isn't sending.
  `sudo grep -c '^FIREBASE_SERVICE_ACCOUNT_BASE64=..' /etc/flux/operations.env`
  prints `0`, and flux-operations logged `FCM push disabled` at startup.
- **Android does, iPhones don't:** Firebase has no APNs key (Cloud
  Messaging → Apple app configuration), so the backend logs
  `FCM send to one device failed [code=THIRD_PARTY_AUTH_ERROR]`. Upload
  the `.p8` to both the development and production slots.

**The APNs key** never expires, but it can only be downloaded once, so the
vault holds the only copy. Firebase keeps a copy for sending, and nothing
else needs it. To replace it (lost, or leaked), create a new key, upload it
to Firebase, then revoke the old one; a team can hold two APNs keys at once,
which allows the overlap.

## 10. Out of scope so far

Not yet built (tracked here so it isn't mistaken for an oversight):
app store assets and Play Store upload.
