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
  **Prettier**
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
├── theme/    design tokens (tokens.scss) and the Ionic variables derived
│             from them (variables.scss)
└── app/      Angular/Ionic UI only: pages, routes, and the providers that
              bridge into src/core
```

- Import `src/core` code only via the `@core/*` path alias
  (`tsconfig.json`), never with a relative `../core/...` path — this is also
  eslint-enforced from `src/app`.
- The only bridge between `src/app` and `src/core` is the `FLUX_API`
  injection token (`src/app/providers/flux-api.token.ts`), provided in
  `src/main.ts`. Everything else in `src/core` is plain data and interfaces.
- Business logic and API types belong in `src/core`. Angular services,
  components, and anything using signals/DI/RxJS belong in `src/app`.

## 4. API layer

`src/core/api/flux-api.ts` defines a small, hand-written `FluxApi` interface
(Promise-based, not RxJS, so it stays portable). The `Task` and
`AppNotification` types it uses are aliases, in `src/core/api/types/index.ts`,
of DTOs generated from the backend's OpenAPI spec.
`src/core/mock/in-memory-flux-api.ts` implements it over static fixtures and
is what `main.ts` provides today — there is no real network layer yet.

### Regenerating API types

`npm run api:generate` rewrites `src/core/api/generated/` from the
flux-operations spec at `http://localhost:9003/v3/api-docs`
(`@hey-api/openapi-ts`, types only; config in `openapi-ts.config.ts`). The
output is committed, so builds and CI never need a running backend.
Regenerate and commit whenever the backend contract changes — type errors
that follow are real contract drift. Never hand-edit `generated/` (it is also
eslint-ignored).

flux-operations must be running locally with springdoc's api-docs enabled.
That is the default for the `dev` and `staging` profiles but off for `prod`,
so with the usual local-prod script, run this from the `flux` backend repo:

```bash
SPRINGDOC_APIDOCS_ENABLED=true bash scripts/run-local-prod.sh operations
```

Every generated property is optional: springdoc emits no `required` lists,
and the backend nulls out fields a user's role may not see.

Only the flux-operations spec is generated today; add flux-iam (`:9001`) as a
second input when authentication is built. A real `HttpClient`-based
`FluxApi` implementation will later replace `InMemoryFluxApi` in the
`main.ts` provider. Call sites (`import { Task } from '@core/api'`) do not
change.

## 5. Run commands

Install once: `npm install`.

| Platform | Command                           | Notes                                                                                                                                                                                            |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web      | `npm start` (alias `ionic serve`) | Opens `http://localhost:8100`, dev environment                                                                                                                                                   |
| Android  | `npm run android`                 | Dev environment. Needs `ANDROID_HOME` set and an AVD (or a device). Run once from Android Studio if `local.properties` hasn't been generated yet.                                                |
| iOS      | `npm run ios`                     | Dev environment. **macOS only.** Needs Xcode 26+. Run `npx cap sync ios` first if native files changed. Simulator runs need no Apple Developer account; a physical device or archive build does. |

Each platform also has `:staging` and (Android/iOS only) `:prod` variants,
e.g. `npm run android:staging`, `npm run ios:prod`, `npm run start:staging`
— see [§6 Environments](#6-environments).

Other useful commands: `npm test` (Vitest), `npm run test:coverage` (Vitest with coverage — writes a text summary plus `coverage/index.html` and `coverage/lcov.info`, no enforced threshold), `npm run lint` / `npm run lint:fix` (ESLint), `npm run format` / `npm run format:check` (Prettier), `npm run build` (production web build to `www/`, alias `npm run build:staging`/`build:dev` for the other environments), `npm run sync` (`ionic cap sync`, copies web build into both native projects — builds production), `npm run api:generate` (regenerate API types from the running backend — see [§4](#4-api-layer)).

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

## 7. Theme

Edit `src/theme/tokens.scss` only — it's the single source of design tokens
(brand color palette, spacing, radius, font family). `src/theme/variables.scss`
derives every `--ion-color-*` CSS variable from it, plus `--ion-font-family`
(from `$flux-font-family`) and `--ion-padding` / `--ion-margin` (from the `md`
spacing token); don't edit that file's values directly. Dark mode follows the OS setting
(`@ionic/angular/css/palettes/dark.system.css` in `src/global.scss`).

## 8. Design mockups

Claude Design mockups live in [`docs/design/`](docs/design/README.md), one
subfolder per screen. When a mockup finalizes a token value, update
`src/theme/tokens.scss`.

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

Native Android/iOS builds aren't part of this workflow; they're covered by
the Android and iOS signing slices.

## 10. Out of scope so far

Not yet built (tracked here so it isn't mistaken for an oversight):
authentication, real API calls, push notifications, offline caching, app
store assets, and release signing.
