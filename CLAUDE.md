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

| Platform | Command                           | Notes                                                                                                                                                                                                                                                                                                            |
| -------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web      | `npm start` (alias `ionic serve`) | Opens `http://localhost:8100`, dev environment                                                                                                                                                                                                                                                                   |
| Android  | `npm run android`                 | Dev environment. Needs `ANDROID_HOME` set and an AVD (or a device). Run once from Android Studio if `local.properties` hasn't been generated yet.                                                                                                                                                                |
| iOS      | `npm run ios`                     | Dev environment. **macOS only.** Needs Xcode 26+. Run `npx cap sync ios` first if native files changed. Simulator runs need no Apple Developer account; a physical device or archive build does. Without a Mac, the `iOS simulator` CI workflow (see [§9 CI](#9-ci)) builds and launches the app on a simulator. |

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

Native builds aren't part of this workflow. An unsigned iOS simulator build
and a signed Android release build each run in their own workflow (below);
signed iOS builds are covered by the iOS signing slice (FM-19).

### iOS simulator

`.github/workflows/ios-simulator.yml` runs a separate `ios-simulator` job on
a `macos-26` runner (Xcode 26.6 by default), to build and launch the app on
an iOS simulator without a Mac. It triggers on pull requests that touch
`ios/**`, `capacitor.config.ts`, `package.json`, `package-lock.json`, or the
workflow file itself, and on manual `workflow_dispatch` runs. It is **not**
a required check — a path-filtered check can never complete on PRs that skip
it, which would leave them permanently unmergeable under `main: require CI`.

Steps: `npm ci`, `npm run build`, `npx cap sync ios`, then `xcodebuild` for
the `App` scheme against `-sdk iphonesimulator` with
`CODE_SIGNING_ALLOWED=NO` (no signing needed for a simulator build). It then
boots an iPhone 17 simulator, installs and launches the app
(`asia.justflux.mobile`), and confirms the process is still running 20
seconds later (`ps` plus `simctl spawn launchctl list`) rather than just
checking that `simctl launch` returned. A screenshot is uploaded as an
artifact on every run; the simulator's app log is uploaded only if the job
fails.

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

## 10. Out of scope so far

Not yet built (tracked here so it isn't mistaken for an oversight):
authentication, real API calls, push notifications, offline caching, app
store assets, iOS release signing (FM-19), and Play Store upload.
