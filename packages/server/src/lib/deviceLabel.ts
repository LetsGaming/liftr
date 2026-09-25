/** Turns a raw `User-Agent` header into a coarse `{os, browser}` pair for the "Aktive Sitzungen"
 *  list in the Profil page. Deliberately a handful of substring checks, not a UA-parser
 *  dependency: this is display-only cosmetics, never used to gate auth (see schema.ts's
 *  `sessions.userAgent` doc comment), so it doesn't need to be exhaustive or precise.
 *
 *  Returns structured data rather than a finished sentence — the client composes and translates
 *  the actual display string (see ProfilePage.vue), since a German sentence baked in here would
 *  be unreadable to an English-locale user. `null` means no `User-Agent` was recorded at all;
 *  `{os: null, browser: null}` means one was present but unrecognized. */
export interface DeviceInfo {
  os: string | null;
  browser: string | null;
}

export function deviceLabel(userAgent: string | null | undefined): DeviceInfo | null {
  if (!userAgent) return null;

  const ua = userAgent;
  let os: string | null = null;
  if (ua.includes("Android")) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iPhone";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "Mac";
  else if (ua.includes("Linux")) os = "Linux";

  // Capacitor's WebView doesn't customize the UA string, so the native app is indistinguishable
  // from its underlying browser engine here — labeling by browser+OS is the honest granularity.
  let browser: string | null = null;
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR/")) browser = "Opera";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("CriOS") || ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  return { os, browser };
}
