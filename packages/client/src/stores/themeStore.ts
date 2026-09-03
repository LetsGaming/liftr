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

export function setStoredTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
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
