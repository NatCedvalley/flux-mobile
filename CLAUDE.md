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
- The bridges between `src/app` and `src/core` are two injection tokens in
  `src/app/providers/`, both provided in `src/main.ts`: `FLUX_API`
  (`flux-api.token.ts`) and `TOKEN_STORE` (`token-store.token.ts`, see
  [§4 Authentication](#authentication)). Everything else in `src/core` is
  plain data, interfaces and classes that take their dependencies as
  constructor arguments.
- Business logic and API types belong in `src/core`. Angular services,
  components, and anything using signals/DI/RxJS belong in `src/app`.

## 4. API layer

`src/core/api/flux-api.ts` defines a small, hand-written `FluxApi` interface
(Promise-based, not RxJS, so it stays portable). The `Task` and
`AppNotification` types it uses are aliases, in `src/core/api/types/index.ts`,
of DTOs generated from the backend's OpenAPI spec.
`src/core/mock/in-memory-flux-api.ts` implements it over static fixtures and
is what `main.ts` provides today — the only real network calls so far are
the sign-in ones below.

A real `FluxApi` implementation will later replace `InMemoryFluxApi` in the
`main.ts` provider. Call sites (`import { Task } from '@core/api'`) do not
change.

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

`src/app/auth/` wraps this for Angular: `AuthService` exposes the state as
signals, `authGuard` keeps signed-out users on `/login`, and `guestGuard`
sends signed-in users past it. `TOKEN_STORE` is a `SecureTokenStore`
(`@aparajita/capacitor-secure-storage`: iOS Keychain with
`afterFirstUnlockThisDeviceOnly`, Android Keystore-encrypted storage) on
native, and an in-memory store on web, so a browser reload signs you out.
Never call the plugin on web: its web fallback is plain localStorage.

`capacitor.config.ts` enables `CapacitorHttp`, so on native `fetch` goes
through the native HTTP stack. The WebView's origins (`https://localhost`
on Android, `capacitor://localhost` on iOS) are therefore never subject to
the backend's CORS list, but these requests don't appear in the WebView
devtools Network tab.

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
run with the flux repo's `scripts/start-local.sh`.

- **Web** (`npm start`, origin `http://localhost:8100`): flux-iam's CORS
  list only has `http://localhost:4200` by default. In the flux repo, set
  `CORS_ALLOWED_ORIGINS=http://localhost:4200,http://localhost:8100` in
  `.env` (what the containers read; also in `.env.local`, which
  `start-local.sh` copies to `.env` when `.env` is missing), then recreate
  flux-iam so it picks up the change — `docker restart` keeps the old
  environment:
  `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d flux-iam`.
- **Android** (emulator or USB phone): forward the port so the device's
  `localhost` is your machine's, then run the dev build:
  `adb reverse tcp:9001 tcp:9001`. Debug builds allow cleartext http
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

Native builds aren't part of this workflow. An unsigned iOS simulator build,
a signed Android release build and a signed iOS release build (with
TestFlight upload) each run in their own workflow (below).

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
the rest of authentication (sign-in and session restore exist — see
[§4](#authentication); the Bearer interceptor, silent refresh while the app
runs and logout come in FM-24, biometric unlock in FM-25), real API calls
beyond sign-in, push notifications, offline caching, app store assets, and
Play Store upload.
