/// <reference types="vite/client" />

/** Injected at build time by vite.config.ts's `define` (packages/client/package.json's own
 *  version) — the web/PWA build's "app version" on platforms where there's no native APK to
 *  read a version from (see useAppUpdate.ts). */
declare const __APP_VERSION__: string;
