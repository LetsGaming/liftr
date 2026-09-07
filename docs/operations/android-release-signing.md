# Setting up Android release signing

`release.yml` (triggered by pushing a `v1.2.3`-style tag) builds an installable APK and attaches
it to a GitHub Release. Without a keystore configured, it still builds — just **unsigned** — which
Android will refuse to install on most devices. This guide walks through generating a keystore
once and teaching both your local machine and GitHub Actions about it. If you've never done this
before: it's a one-time, ~10 minute setup, and every step below is copy-pasteable.

## Why this matters (read before you start)

The keystore you generate is the app's permanent identity. Every future release must be signed
with the **same** keystore, or Android treats it as a different app — an update won't overwrite
the old install; you'll have to uninstall it first, losing anything only stored client-side. There
is no "reset" or "recover" for a lost keystore; back it up somewhere durable (a password manager
that supports file attachments, an encrypted drive, etc.), not just this one machine.

## 1. Generate the keystore

Requires a JDK (any recent one; `keytool` ships with it).

```bash
keytool -genkeypair -v \
  -keystore liftr-release.keystore \
  -alias liftr \
  -keyalg RSA -keysize 2048 -validity 10000
```

You'll be prompted for a keystore password, then some identity fields (name/org/etc — these end
up in the certificate but don't matter functionally for a self-signed, non-Play-Store app; answer
them however you like, including leaving them blank), then a key password (you can reuse the
keystore password when prompted, or set a different one — just remember which).

This produces one file: `liftr-release.keystore`. **Do not commit it to the repo** —
`packages/client/android/.gitignore` already excludes `*.keystore`/`*.jks`/`keystore.properties`,
but keep it out of any git command (`git add`) regardless.

## 2. Add it to GitHub Actions

The workflow reads four repo secrets. Go to **GitHub → your repo → Settings → Secrets and
variables → Actions → New repository secret**, and add each of these:

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The keystore file, base64-encoded (command below) |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password you set in step 1 |
| `ANDROID_KEY_ALIAS` | `liftr` (or whatever you passed to `-alias` above) |
| `ANDROID_KEY_PASSWORD` | The key password you set in step 1 |

To get the base64 value for `ANDROID_KEYSTORE_BASE64`:

```bash
# macOS
base64 -i liftr-release.keystore | pbcopy
# Linux
base64 -w0 liftr-release.keystore | xclip -selection clipboard   # or: base64 -w0 liftr-release.keystore > keystore.b64.txt
```

Paste the copied value as the secret's value (it's one long line — that's expected).

Alternatively, if you have the `gh` CLI installed and authenticated (`gh auth login`), you can set
all four from your terminal instead of the web UI:

```bash
gh secret set ANDROID_KEYSTORE_BASE64 --body "$(base64 -w0 liftr-release.keystore)"
gh secret set ANDROID_KEYSTORE_PASSWORD --body "<your keystore password>"
gh secret set ANDROID_KEY_ALIAS --body "liftr"
gh secret set ANDROID_KEY_PASSWORD --body "<your key password>"
```

Once all four are set, push a tag (`git tag v0.1.0 && git push origin v0.1.0`) or run the
**Release** workflow manually from the Actions tab (`workflow_dispatch`) — the build log's
"Decode release keystore" step will no longer print the unsigned-build warning, and the resulting
APK will install as an update over any previously-signed install of the app.

## 3. (Optional) Build a signed release locally

Useful for testing a release build without pushing a tag. Create
`packages/client/android/keystore.properties` (already gitignored) pointing at your keystore file:

```properties
storeFile=/absolute/path/to/liftr-release.keystore
storePassword=<your keystore password>
keyAlias=liftr
keyPassword=<your key password>
```

Then, from `packages/client`:

```bash
pnpm build
npx cap sync android
cd android && ./gradlew assembleRelease
```

The signed APK lands at `packages/client/android/app/build/outputs/apk/release/app-release.apk`.

## If you ever lose the keystore

Generate a new keystore (step 1), update the four GitHub secrets (step 2) with the new values, and
treat the next release as a fresh install for anyone who already has the app on their device
(uninstall the old one first — same as installing on a new phone).
