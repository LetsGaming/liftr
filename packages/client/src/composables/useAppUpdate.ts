import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { computed, ref } from "vue";
import { isAndroid } from "../lib/platform";

/** This app's own GitHub repo — release.yml publishes a signed APK to a GitHub Release on every
 *  `v*.*.*` tag (see scripts/bump-version.mjs), so this is where the client checks for one. Not
 *  user-configurable, unlike the server URL — it names a fixed fact about this codebase, not a
 *  per-install setting. */
const REPO = "LetsGaming/liftr";

interface GithubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

/** Plain dotted-numeric compare ("1.2.10" > "1.2.9") — this project's own tags are always a
 *  bare X.Y.Z (bump-version.mjs), so no need for full semver (pre-release/build metadata). */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

// Module-level (not per-call refs, same pattern as useToast.ts) — App.vue's automatic
// launch-time check and ProfilePage.vue's own "Nach Updates suchen" button/display share one
// result instead of each firing its own GitHub request and possibly disagreeing.
//
// currentVersion starts pre-filled from __APP_VERSION__ (the client package's own build-time
// version, vite.config.ts) everywhere except Android, where check() overwrites it with the real
// installed version from @capacitor/app — the authoritative source there, and the only one that
// actually exists (App.getInfo() throws "not implemented" on web). Web/iOS never call check(),
// so their version needs to already be present without it.
const currentVersion = ref<string | null>(isAndroid() ? null : __APP_VERSION__);
const latestVersion = ref<string | null>(null);
const downloadUrl = ref<string | null>(null);
const checking = ref(false);
const error = ref<string | null>(null);

const updateAvailable = computed(
  () => !!currentVersion.value && !!latestVersion.value && isNewerVersion(latestVersion.value, currentVersion.value),
);

/**
 * App version + (Android-only) update check against this repo's GitHub Releases — no backend
 * involvement, since the server has no idea what APK version is installed on anyone's phone.
 * `check()` is meaningful on Android only (callers gate calling it on isAndroid() — App.vue,
 * ProfilePage.vue); web/iOS only ever read the pre-filled `currentVersion`, no update concept.
 * Downloading hands off to the system browser (Browser.open) rather than downloading+installing
 * in-app: Android's own download manager and "tap to install" notification already do this,
 * with no new permissions, FileProvider wiring, or native code needed on our side.
 */
export function useAppUpdate() {
  async function check(): Promise<void> {
    checking.value = true;
    error.value = null;
    try {
      const info = await App.getInfo();
      currentVersion.value = info.version;

      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
      const release: GithubRelease = await res.json();

      latestVersion.value = release.tag_name.replace(/^v/, "");
      downloadUrl.value = release.assets.find((a) => a.name.endsWith(".apk"))?.browser_download_url ?? null;
    } catch {
      // Silent by design for the automatic on-launch check (App.vue) — GitHub being briefly
      // unreachable shouldn't ever surface as an error to a user who didn't ask to be told
      // anything. The manual "Nach Updates suchen" button (ProfilePage.vue) reads this same
      // `error` ref and shows it, since that check *was* explicitly requested.
      error.value = "Update-Prüfung fehlgeschlagen. Später erneut versuchen.";
    } finally {
      checking.value = false;
    }
  }

  async function openDownload(): Promise<void> {
    if (downloadUrl.value) await Browser.open({ url: downloadUrl.value });
  }

  return { currentVersion, latestVersion, updateAvailable, downloadUrl, checking, error, check, openDownload };
}
