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
              project list with the caller's roles (projects/), and
              the providers that bridge into src/core
```

- Import `src/core` code only via the `@core/*` path alias
  (`tsconfig.json`), never with a relative `../core/...` path — this is also
  eslint-enforced from `src/app`.
- The bridges between `src/app` and `src/core` are two injection tokens in
  `src/app/providers/`, both provided in `src/main.ts`: `FLUX_API`
  (`flux-api.token.ts`) and `TOKEN_STORE` (`token-store.token.ts`, see
  [§4 Authentication](#authentication)). Everything else in `src/core` is
  plain data, interfaces and classes that take their dependencies as
  constructor arguments.
- Business logic and API types belong in `src/core`. Angular services,
  components, and anything using signals/DI/RxJS belong in `src/app`.

### Navigation

`src/app/tabs/tabs.routes.ts` defines three tabs, each its own stack:
**My Work** (`/tabs/my-work`, the default), **Projects** (`/tabs/projects`)
and **Inbox** (`/tabs/inbox`). The design has no Settings tab: Settings is
pushed onto the My Work stack (`/tabs/my-work/settings`) from the avatar
button. Task detail is routed under every tab as
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
win. Releases (handoff screen 3k) has no tab.

### My Work

My Work (handoff 3a) has three segments, each one `GET /dashboard/my-tasks`
query of open tasks (one page of 100). **Focus** asks for those assigned
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
a row pins or unpins it. The backend has no pinning, so the pins and the
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
(key, priority, due date and the assignee's avatar). The List/Board/Calendar
segment is not built yet (FM-6).

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

### Task detail

Task detail (handoff 3e–3g, `src/app/pages/tasks/`) has a header block
(back, type icon, key with a copy button, the watch bell, ⋯ for the
overflow sheet, the title up to 3 lines, then status, priority and type
chips) over Details, Comments and Activity tabs. The bell
subscribes with `POST .../subscribe` and unsubscribes with `DELETE`,
showing the change at once and putting it back with a toast if the server
refuses. The key is copied with `@capacitor/clipboard`.

The docked action bar (`task-action-bar/`) has a comment button (it opens
the Comments tab until FM-34's composer). For an EDITOR+ it also has "Move
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
  reporter, due date (`12 Sep · overdue` in red), release (the first
  linked release, display-only), parent, labels (two, then `+n`), the
  description clamped to 6 lines with Show more, and subtasks for MASTER
  and EPIC only (`GET .../children`). Parent and subtask links push onto
  the same stack. See Editing below for what it edits.
- **Comments** (`task-comments/`) loads with the page, so the tab shows a
  count: the server pages top-level comments (100 a page, oldest first)
  with their replies nested, and its total counts threads only, so
  `commentCount()` adds the replies. Read-only, with reactions; the
  caller's own comments are tinted.
- **Activity** (`task-activity/`) loads the first time its tab opens,
  newest first, grouped by day (`activityDays()`), with `activityView()`
  (`src/core/task-detail/`) deciding each entry's icon, tint and wording.
- Pull-to-refresh reloads everything; each part has its own error state
  with Retry.

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
  4. It offers a 4 s Undo toast, above the tab bar or the docked bar.

  If the server refuses, the task is put back and the server's message
  shown.

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
- In Details, the Due date and Labels rows get a chevron. Due date opens
  `ion-datetime presentation="date"` (with Clear). The description's pencil
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
    type use it, and FM-35's create sheet should too. A multiple choice edits
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

**Rich text.** Descriptions and comments are stored as MARKDOWN, HTML or
EDITORJS, and older rows hold Editor.js JSON under MARKDOWN, so the format
is detected by content too. `renderRichText()` (`src/core/rich-text/`)
renders Markdown with `marked`, converts Editor.js JSON with a trimmed port
of flux-web's `json-to-html.ts`, and always finishes with DOMPurify, using
flux-web's sanitizer policy (no scripts, frames, forms or inline styles).
`app-rich-text` binds that output with `bypassSecurityTrustHtml`, since
Angular's own sanitizer would strip mention ids. Links get
`target="_blank"`, so they open in the system browser instead of replacing
the WebView. Editor.js images that are uploads show a placeholder until
attachments (FM-36) can sign their URLs.

**Roles.** `can(role, action)` (`src/core/permissions/`) holds the
backend's minimum role for each action: VIEWER reads, COMMENTER comments,
EDITOR edits, changes status, creates and archives, and LEAD reassigns and
deletes (MANAGER ranks above LEAD). `MyProjectsService`
(`src/app/projects/`) caches `GET /projects/mine` once per signed-in
account, and exposes `role(projectId)` and `can(projectId, action)`. The
Projects tab and My Work search load their projects through it, and the
Projects tab's pull-to-refresh calls `invalidate()` first, so the counts
are fresh.

## 4. API layer

`src/core/api/flux-api.ts` defines a small, hand-written `FluxApi` interface
(Promise-based, not RxJS, so it stays portable) over flux-operations: my
tasks, a project's tasks, one task, its update (PUT), parent,
assignees and delete, a status change, archive and unarchive, its
children, activities, comments and subscription (read, subscribe,
unsubscribe), my projects, workflow statuses, resolutions, task view
settings (read and update), labels (list, add to and remove from a task),
assignable members and notifications. The types it uses (`Task`, `MyTask`, `MyProject`, …) are
aliases, in `src/core/api/types/index.ts`, of DTOs generated from the
backend's OpenAPI spec. Paged lists use the hand-written generic `Page<T>`,
because springdoc emits the list endpoints' 200 responses as `unknown`.

`HttpFluxApi` (`src/core/api/http-flux-api.ts`) is what `main.ts` provides:
it calls `environment.apiBaseUrl` (which ends in `/api/v1`, so paths are
written without it) and makes every request through
`AuthService.withAccessToken` (see below). `JsonHttpClient`
(`src/core/http/`) is the request (GET, POST, PUT, PATCH and DELETE), timeout,
query-string and JSON handling it shares with `AuthClient`. `src/core/mock/in-memory-flux-api.ts` is the
test double: its fixtures are dated relative to today and it applies the
my-tasks filters (including status, priority and search) and the project
list's filters (comma lists, assignee, labels, search) and sort, so page
specs use it (`addProjectTasks()` adds rows to page through). Its status
changes, archiving and edits follow the backend's rules and error codes
(a PUT clears what it leaves out, as above), and `done` is the closed
status. Project p1 has five labels. CHK-142
carries the detail fixtures (Markdown description, parent, release, a
comment thread with a reply, reactions and an Editor.js body, a day-split
activity timeline, and bug fields detail doesn't show), and the EPIC
CHK-120 has two subtasks.

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
- `AuthSession` holds the tokens and account and persists the tokens
  through a `TokenStore`. On a cold start `restore()` refreshes an expired
  access token (they live 5 minutes), then loads the account. A 4xx drops
  the session; no response or a 5xx keeps it, so being offline never signs
  anyone out.
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
  even when the server call fails.

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
`src/environments/build-info.ts` (app version, short git commit, and any
`FLUX_*` environment variable) before every build/serve/test — see the
`ionic:build:before` / `ionic:serve:before` / `pre*` scripts in
`package.json`. This is the only place environment-specific values are
injected; nothing is hardcoded and nothing here is committed. Since anything
shipped in a mobile bundle can be extracted, only put client-side keys here
(e.g. a Sentry DSN) — never a real server secret.

The Settings page shows the active environment name and the build version.
`webBaseUrl` is flux-web's origin, used by task detail's Copy link.

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

Dark mode follows the OS setting: light values sit on `:root`, and dark ones
override them under `prefers-color-scheme: dark`. Ionic's own dark palette is
not imported, because it would override the tokens.

`src/theme/typography.scss` bundles Inter and CommitMono (from
`src/theme/fonts/`), sets the body text defaults, and defines the
`.flux-screen-title` class for tab-root titles. Icons are the handoff's
Lucide set: `registerFluxIcons()` (`src/app/icons/`, called in `main.ts` and
the test setup) registers all of them with ionicons, so templates use
`<ion-icon name="list-todo">`. The status bar's text follows the theme
(`StatusBarService`, native only); on Android the WebView runs edge to edge.

## 8. Design mockups

The current design is the Claude Design handoff in
[`docs/design/mobile-v2/`](docs/design/mobile-v2/README.md) (see
[`docs/design/README.md`](docs/design/README.md)). Its README is the spec:
tokens, screens `3a`–`3n`, and an Ionic component mapping to follow. Recreate
screens with Ionic primitives; never port its `support.js` runtime or inline
styles. When a design changes a token value, update `src/theme/tokens.scss`.

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
workflow statuses and three tasks dated around today, so My Work and the
Projects list have rows, and empty comments, activity and subtasks for
task detail; it answers GETs only), and
`scripts/ci/ios-swipe-back.sh` drives
the simulator with [idb](https://fbidb.io/) (`idb-companion` from Homebrew,
`fb-idb` on Python 3.11). It signs in, opens the first task on the Projects
tab, and swipes from the left edge. idb can't see inside the WebView (its
accessibility tree stops at the app), so the script taps fixed points on the
iPhone 17 and judges the result from screenshots with Pillow. Sign-in must
reach the mock IAM (checked in its log). After each tap or swipe the script
polls screenshots for up to 45 s, because idb can deliver input ~15 s late
on a slow runner: switching to Projects must change over 2% of pixels,
opening the task over 20%, and the swipe must bring the screen back to within
2% of the list. Detail changes about 35%. The limit stays well above the
~7% of the tapped row's pressed highlight, which can hold still while a slow
runner loads the detail page; at 5% the script once swiped on the list
before detail opened. Moving the login fields, the tab bar or the Projects list's
first row means updating the points at the top of the script.

Screenshots (`my-work.png`, `list.png`, `detail.png`, `after-swipe.png`, and
the final `flux-ios-simulator.png`) are uploaded as one artifact on every
run; the simulator's app log and both mock logs only if the job fails.

### Android signed build

`.github/workflows/android-release.yml` produces a signed Android build for
testers. It runs **only on manual `workflow_dispatch`** (Actions → Android
release → Run workflow, or
`gh workflow run android-release.yml -f configuration=production`), with a
`configuration` input of `production` (default) or `staging` (staging API
URLs are still placeholders — see [§6](#6-environments)).

Steps: `npm ci`, the web build for that configuration, `npx cap sync android`,
then `./gradlew bundleRelease assembleRelease` on JDK 21. It checks that the
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
Settings → Environments), which must hold four secrets:
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`
and `ANDROID_KEY_PASSWORD`. The job fails fast with a clear message if any is
missing. The keystore is decoded into the runner's temp directory and handed
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

Steps on a `macos-26` runner: `npm ci`, the web build for that configuration,
`npx cap sync ios`, then the signing certificate is imported into a temporary
keychain and the provisioning profile installed. `xcodebuild archive` builds
the `App` scheme's Release configuration, and `xcodebuild -exportArchive`
exports an `.ipa` using `ios/App/ExportOptions.plist`. The job checks with
`codesign` that the app is signed by an Apple Distribution certificate for
team `44UNNHB3V6`, and that its version and build number are the expected
ones, writes both to the job summary, and uploads
`flux-<configuration>-<version>-<buildNumber>.ipa` as an `ios-release`
artifact (kept 30 days). If `upload` is set, `xcrun altool --upload-app`
sends it to App Store Connect; the build then appears under TestFlight once
Apple finishes processing. The keychain, profile and API key are removed at
the end of every run.

**Signing settings.** The App target's **Release** config uses manual
signing: `DEVELOPMENT_TEAM = 44UNNHB3V6`, identity `Apple Distribution`,
profile `Flux App Store` (in `project.pbxproj`; the team ID is also in the
workflow's `APPLE_TEAM_ID`). Debug keeps automatic signing, so simulator and
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
hold six secrets: `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD`,
`IOS_PROVISIONING_PROFILE_BASE64`, `APP_STORE_CONNECT_API_KEY_ID`,
`APP_STORE_CONNECT_API_ISSUER_ID` and `APP_STORE_CONNECT_API_KEY_P8_BASE64`.
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
   the `.p12` password, Key ID and Issuer ID as the six secrets in the
   `ios-release` Environment. Optionally add required reviewers there.
9. In App Store Connect → TestFlight, create an internal testing group and
   add testers. They install builds with the TestFlight app on their device.

**Renewal.** The distribution certificate and the profile expire after a
year. Create a new certificate (steps 2–3), regenerate the profile under the
same name `Flux App Store` (step 4), and replace the three affected secrets.

## 10. Out of scope so far

Not yet built (tracked here so it isn't mistaken for an oversight):
task create (FM-35), push notifications
(FM-7 also unregisters the device token in `AuthSession.logout()`), offline
caching, app store assets, and Play Store upload.
