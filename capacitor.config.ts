import type { CapacitorConfig } from '@capacitor/cli';

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
  },
};

export default config;
