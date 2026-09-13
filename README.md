# Flux Mobile

iOS and Android companion app for the Flux task manager at justflux.asia.
Built with Ionic 9, Angular 22 (standalone components, signals) and
Capacitor 8.

See [CLAUDE.md](CLAUDE.md) for folder conventions and architecture.

## Prerequisites

### All platforms

- **Node.js** `^22.22.3`, `^24.15.0` or `>=26` (required by Angular 22).
- **npm**. Tested with npm 12.0.2. The npm 10.9.8 that ships with
  Node 22.23 crashes during install with
  `Cannot read properties of null (reading 'edgesOut')`; upgrade with
  `npm install -g npm@latest`.

### Android

- **Android Studio** 2025.2.1 or newer, with SDK Platform **API 36**
  installed. The app's minimum supported version is API 24.
- **JDK 17 or 21.** Gradle 8.14.3 cannot run on JDK 25. Point `JAVA_HOME`
  at the JDK, or pick it in Android Studio under
  *Settings → Build Tools → Gradle → Gradle JDK*.
- **`ANDROID_HOME`** set to your SDK folder, for example
  `C:\Users\<you>\AppData\Local\Android\Sdk` on Windows or
  `~/Library/Android/sdk` on macOS.
- An **emulator** (create one in Android Studio's Device Manager) or a
  device with USB debugging enabled.

### iOS (macOS only)

- **macOS** with **Xcode 26** or newer and its command line tools.
- An iOS simulator runtime installed from Xcode. The app targets iOS 15.0+.
- Dependencies use Swift Package Manager, so CocoaPods is not needed.
- Simulator runs need no Apple Developer account. Running on a physical
  device requires one, plus a signing team set in Xcode.

## Setup

```bash
git clone <repo-url> flux-mobile
cd flux-mobile
npm ci
```

## Run

| Platform | Command | What it does |
|---|---|---|
| Browser | `npx ionic serve` | Serves the app at http://localhost:8100 with live reload. `npm start` also works. |
| Android | `npm run android` | Builds the web app, syncs it into `android/`, builds the APK and launches it on a device or emulator you pick. |
| iOS | `npm run ios` | Same flow for `ios/` and an iOS simulator. macOS only. |

To target a specific device, list targets first, then pass one:

```bash
npx ionic cap run android --list
npx ionic cap run android --target <target-id>
```

To work in the native IDE instead, run `npm run build`, then `npm run sync`,
then `npx cap open android` or `npx cap open ios`.

## Other commands

| Command | Purpose |
|---|---|
| `npm test` | Unit tests (Vitest). Add `-- --watch=false` for a single run. |
| `npm run lint` | ESLint, including the framework-agnostic `src/core` import rules. |
| `npm run build` | Production web build into `www/`. |
| `npm run sync` | Copies `www/` and plugin config into both native projects. |
