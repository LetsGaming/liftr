/** UI language preference. Purely a client-side rendering preference — not synced to the server,
 *  same reasoning as themeStore.ts's theme and xpStore.ts's showXp flag: this needs to be readable
 *  before the app has even authenticated (i18n.ts reads it at module scope to construct the
 *  vue-i18n instance, before Pinia exists).
 *
 *  A first-time visitor with no stored preference gets German unless their browser reports an
 *  English language, matching every other well-behaved app; an explicit choice in Profil →
 *  Darstellung (setStoredLocale, below) writes to localStorage and permanently overrides it. */
import { defineStore } from "pinia";
import { i18n } from "../i18n";

export type Locale = "de" | "en";
export const LOCALES: Locale[] = ["de", "en"];
const LOCALE_KEY = "liftr.locale";

export function getStoredLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_KEY);
  if (stored === "de" || stored === "en") return stored;
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "de";
}

/** Keeps <html lang> in sync with the active locale — screen readers and browser features
 *  (spellcheck, translate prompts, date pickers) key off this, not off vue-i18n's internal state. */
export function applyLocale(locale: Locale) {
  document.documentElement.lang = locale;
}

export function setStoredLocale(locale: Locale) {
  localStorage.setItem(LOCALE_KEY, locale);
  i18n.global.locale.value = locale;
  applyLocale(locale);
}

export const useLocaleStore = defineStore("locale", {
  state: () => ({
    locale: getStoredLocale(),
  }),
  actions: {
    setLocale(locale: Locale) {
      this.locale = locale;
      setStoredLocale(locale);
    },
  },
});
