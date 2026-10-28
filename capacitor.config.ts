import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'asia.justflux.mobile',
  appName: 'Flux',
  webDir: 'www',
  plugins: {
    // Routes fetch/XHR through the native HTTP stack, so API calls from the
    // WebView (origin https://localhost / capacitor://localhost) aren't
    // subject to CORS. They don't show in the WebView devtools Network tab.
    CapacitorHttp: {
      enabled: true,
    },
    // Text fields (the title and description sheets) stay above the
    // keyboard: the body shrinks to the space left (handoff README L329).
    // Android runs the WebView edge to edge, which counts as full screen,
    // so it only resizes with `resizeOnFullScreen`.
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
    // No system banner for a push while the app is open: the app shows its
    // own toast, as on Android, which never shows one (FM-45).
    FirebaseMessaging: {
      presentationOptions: [],
    },
  },
  experimental: {
    ios: {
      spm: {
        // Package traits need Swift tools 6.1 (Xcode 16.3+).
        swiftToolsVersion: '6.1',
        // Analytics without the IDFA (no AdSupport), as Android leaves out
        // the advertising ID (FM-64).
        packageTraits: {
          '@capacitor-firebase/analytics': ['AnalyticsWithoutAdIdSupport'],
        },
        // The Firebase plugins' SPM packages need this to avoid a package
        // identity collision (their READMEs; Capacitor CLI 8.4+).
        packageOptions: {
          '@capacitor-firebase/analytics': { symlink: true },
          '@capacitor-firebase/crashlytics': { symlink: true },
          '@capacitor-firebase/messaging': { symlink: true },
        },
      },
    },
  },
};

export default config;
