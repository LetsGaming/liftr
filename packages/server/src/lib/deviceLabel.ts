/** Turns a raw `User-Agent` header into a short human label for the "Aktive Sitzungen" list in the
 *  Profil page — e.g. "Chrome · Windows", "Safari · iPhone", "Liftr App · Android". Deliberately a
 *  handful of substring checks, not a UA-parser dependency: this is display-only cosmetics, never
 *  used to gate auth (see schema.ts's `sessions.userAgent` doc comment), so it doesn't need to be
 *  exhaustive or precise. */
export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unbekanntes Gerät";

  const ua = userAgent;
  let os = "Unbekannt";
  if (ua.includes("Android")) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iPhone";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "Mac";
  else if (ua.includes("Linux")) os = "Linux";

  // Capacitor's WebView doesn't customize the UA string, so the native app is indistinguishable
  // from its underlying browser engine here — labeling by browser+OS is the honest granularity.
  let browser = "Unbekannt";
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR/")) browser = "Opera";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("CriOS") || ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  return `${browser} · ${os}`;
}
