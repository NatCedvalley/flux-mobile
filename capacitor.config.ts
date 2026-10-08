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
  },
};

export default config;
