/// <reference types="vite/client" />

/** Injected at build time by vite.config.ts's `define` (packages/client/package.json's own
 *  version) — the web/PWA build's "app version" on platforms where there's no native APK to
 *  read a version from (see useAppUpdate.ts). */
declare const __APP_VERSION__: string;

/** @intlify/unplugin-vue-i18n compiles a locale pack's YAML into a vue-i18n message object at
 *  build time (see vite.config.ts/vitest.config.ts) — this just tells TypeScript what shape a
 *  `.yaml` import resolves to. */
declare module "*.yaml" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary nested message tree,
  // not worth mirroring in a hand-written ambient type.
  const messages: Record<string, any>;
  export default messages;
}
