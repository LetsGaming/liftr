/** Theme preference (nebula-design-framework.md §2.2), applied via <html data-theme="...">.
 *  Purely a client-side rendering preference — not synced to the server, same reasoning as
 *  xpStore.ts's showXp flag: this needs to be readable before the app has even authenticated.
 *
 *  Fix (post-launch correction): the original version defaulted every first-time visitor to
 *  dark regardless of OS preference, on the reasoning that "theme is a user setting, not
 *  inferred from OS preference." That reasoning was wrong for the *default* specifically —
 *  a user opening the app for the first time reasonably expects it to match their system,
 *  same as every other well-behaved app. System preference now decides the *default*; an
 *  explicit toggle (setStoredTheme, below) writes to localStorage and permanently overrides
 *  it from then on — the override behavior itself is unchanged. */
import { defineStore } from "pinia";

export type Theme = "dark" | "light";
const THEME_KEY = "liftr.theme";

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Light-mode bug fix: index.html's `<meta name="theme-color">` (the color the OS/browser
 *  chrome — status bar, task switcher — paints around the page) was a static `#0a0c14`, never
 *  updated on theme change, so it stayed dark even after the user switched to light mode.
 *  Reads the *actual* current `--bg` off the document (post `dataset.theme` assignment, so the
 *  right `:root`/`:root[data-theme="light"]` block is already in effect) instead of duplicating
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
