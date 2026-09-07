# Running Liftr on a phone

There are two ways to get Liftr onto a phone: install it as a PWA straight from the browser (no
build step, works today), or install a native APK built by CI from a tagged release.

## Option 1: Install as a PWA (recommended for most people)

Liftr is an installable, offline-first Progressive Web App (see the root
[`README.md`](../../README.md)). Open your self-hosted instance's URL in your phone's browser and
use **"Add to Home Screen"** (Safari on iOS, Chrome/most browsers on Android). It installs like a
native app icon, runs standalone (no browser chrome), and keeps working offline — the service
worker caches the app shell and exercise catalog/images, and queues logged sets locally until
you're back online.

This requires no signing, no sideloading permission changes, and nothing to rebuild — it's just
your running Liftr instance, installed. Use this unless you specifically want a distributable APK
file (e.g. to hand to someone else, or you prefer a "real" installed app over a home-screen
shortcut).

## Option 2: Install the APK from a GitHub Release

Liftr also ships as a Capacitor-wrapped native Android app, built and signed automatically by
[`.github/workflows/release.yml`](../../.github/workflows/release.yml):

1. A maintainer pushes a tag matching `vX.Y.Z` (e.g. `v1.4.0`).
2. GitHub Actions builds the client, syncs it into the Android project (`cap sync android`), and
   runs `./gradlew assembleRelease` to produce a signed APK.
3. The APK is attached directly to the resulting GitHub Release.

To install it:

1. Go to the repo's **Releases** page and download the `.apk` asset from the release you want.
2. On your Android phone, enable **"Install from unknown sources"** for the app you're installing
   through (Settings → Apps → Special access → Install unknown apps — the exact path varies by
   Android version/OEM), since this isn't coming from the Play Store.
3. Open the downloaded APK and install it.

Because every release is signed with the same keystore, installing a newer release's APK later
will upgrade in place rather than requiring an uninstall — as long as that keystore hasn't
changed (see the signing guide below).

### Before this produces a properly-signed APK

The workflow will still build and attach an APK even without a keystore configured — but it'll be
**unsigned**, which most Android devices refuse to install. A maintainer needs to do a one-time
keystore setup first (generate a release keystore, add it as GitHub Actions secrets). That process
is documented in full in
[`docs/operations/android-release-signing.md`](../operations/android-release-signing.md) — follow
that guide before cutting the first real release; this page won't duplicate its steps.
