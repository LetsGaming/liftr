/** Theme preference, applied via <html data-theme="...">.
 *  Purely a client-side rendering preference — not synced to the server, same reasoning as
 *  xpStore.ts's showXp flag: this needs to be readable before the app has even authenticated.
 *
 *  A first-time visitor with no stored preference gets the OS's `prefers-color-scheme` as the
 *  default, matching every other well-behaved app; an explicit toggle (setStoredTheme, below)
 *  writes to localStorage and permanently overrides it from then on. */
import { defineStore } from "pinia";

export type Theme = "dark" | "light";
const THEME_KEY = "liftr.theme";

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Keeps index.html's `<meta name="theme-color">` (the color the OS/browser chrome — status
 *  bar, task switcher — paints around the page) in sync with the active theme. Reads the
 *  *actual* current `--bg` off the document (post `dataset.theme` assignment, so the right
 *  `:root`/`:root[data-theme="light"]` block is already in effect) instead of duplicating
 *  tokens.css's hex constants here — this can't silently drift out of sync with tokens.css the
 *  way a hardcoded second copy could. */
function applyThemeColorMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (bg) meta.setAttribute("content", bg);
}

/** Applies a theme to the document: sets `data-theme` (tokens.css's selector) and, in the same
 *  step, the theme-color meta tag above — called both at boot (main.ts, before first paint) and
 *  on every explicit toggle, so the meta tag never lags the actual visible theme. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  applyThemeColorMeta();
}

export function setStoredTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export const useThemeStore = defineStore("theme", {
  state: () => ({
    theme: getStoredTheme(),
  }),
  actions: {
    toggle() {
      this.theme = this.theme === "dark" ? "light" : "dark";
      setStoredTheme(this.theme);
    },
  },
});
