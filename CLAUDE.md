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
- Tests: **Vitest** (via `@angular/build:unit-test`), lint: **ESLint** via
  `angular-eslint`

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
(Promise-based, not RxJS, so it stays portable) plus the `Task` and
`AppNotification` types it needs. `src/core/mock/in-memory-flux-api.ts`
implements it over static fixtures and is what `main.ts` provides today —
there is no real network layer yet.

The Spring Boot backend does not yet expose an OpenAPI spec. When it does
(via springdoc-openapi):

1. Generated types land in `src/core/api/generated/`.
2. `src/core/api/types/index.ts` re-exports from there instead of the
   hand-written files.
3. A real `HttpClient`-based `FluxApi` implementation replaces
   `InMemoryFluxApi` in the `main.ts` provider.

Call sites (`import { Task } from '@core/api'`) do not change.

## 5. Run commands

Install once: `npm install`.

| Platform | Command | Notes |
|---|---|---|
| Web | `npm start` (alias `ionic serve`) | Opens `http://localhost:8100`, dev environment |
| Android | `npm run android` | Dev environment. Needs `ANDROID_HOME` set and an AVD (or a device). Run once from Android Studio if `local.properties` hasn't been generated yet. |
| iOS | `npm run ios` | Dev environment. **macOS only.** Needs Xcode 26+. Run `npx cap sync ios` first if native files changed. Simulator runs need no Apple Developer account; a physical device or archive build does. |

Each platform also has `:staging` and (Android/iOS only) `:prod` variants,
e.g. `npm run android:staging`, `npm run ios:prod`, `npm run start:staging`
— see [§6 Environments](#6-environments).

Other useful commands: `npm test` (Vitest), `npm run lint` (ESLint), `npm run build` (production web build to `www/`, alias `npm run build:staging`/`build:dev` for the other environments), `npm run sync` (`ionic cap sync`, copies web build into both native projects — builds production).

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

## 9. Out of scope so far

Not yet built (tracked here so it isn't mistaken for an oversight):
authentication, real API calls, push notifications, offline caching, CI
config, app store assets, and release signing.
