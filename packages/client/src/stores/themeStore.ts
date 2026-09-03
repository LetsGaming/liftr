/** Theme preference (nebula-design-framework.md §2.2), applied via <html data-theme="...">.
 *  Purely a client-side rendering preference — not synced to the server, same reasoning as
 *  xpStore.ts's showXp flag: this needs to be readable before the app has even authenticated. */
import { defineStore } from "pinia";

export type Theme = "dark" | "light";
const THEME_KEY = "liftr.theme";

export function getStoredTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
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
