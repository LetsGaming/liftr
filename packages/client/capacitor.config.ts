import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.liftr.app',
  appName: 'Liftr',
  webDir: 'dist',
  // Android 15+ (targetSdk 35+, see variables.gradle) forces edge-to-edge, so the WebView draws
  // under the status/nav bars by default. "force" makes Capacitor reserve those bands as real
  // margins instead — without this, nothing in the app (dialogs, modal headers, the "Später"
  // button in onboarding, ...) can reliably stay clear of the notch/status bar, since the app had
  // no @capacitor/status-bar setup and no windowLayoutInDisplayCutoutMode either.
  android: {
    adjustMarginsForEdgeToEdge: 'force',
  },
};

export default config;
