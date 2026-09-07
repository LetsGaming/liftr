// @vitest-environment jsdom
//
// themeStore manipulates `document`/`localStorage`/`matchMedia` directly (no service layer) —
// see tests/README.md's Environment section for why this needs jsdom rather than the default
// node environment.
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTheme, getStoredTheme, setStoredTheme, useThemeStore } from "~client/stores/themeStore";

const THEME_KEY = "liftr.theme";

function stubMatchMedia(prefersLight: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: prefersLight }),
  );
}

function addThemeColorMeta(): HTMLMetaElement {
  const meta = document.createElement("meta");
  meta.setAttribute("name", "theme-color");
  document.head.appendChild(meta);
  return meta;
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  document.documentElement.style.removeProperty("--bg");
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getStoredTheme", () => {
  it("returns the stored theme when localStorage already has a valid value", () => {
    localStorage.setItem(THEME_KEY, "light");
    expect(getStoredTheme()).toBe("light");

    localStorage.setItem(THEME_KEY, "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("falls back to the OS preference when nothing is stored: light when the system prefers light", () => {
    stubMatchMedia(true);
    expect(getStoredTheme()).toBe("light");
  });

  it("falls back to dark when nothing is stored and the system does not prefer light", () => {
    stubMatchMedia(false);
    expect(getStoredTheme()).toBe("dark");
  });

  it("ignores a garbage stored value and falls back to the OS preference", () => {
    localStorage.setItem(THEME_KEY, "sepia");
    stubMatchMedia(true);
    expect(getStoredTheme()).toBe("light");
  });
});

describe("applyTheme", () => {
  it("sets document.documentElement's data-theme attribute", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("updates the theme-color meta tag's content from the current --bg custom property", () => {
    const meta = addThemeColorMeta();
    document.documentElement.style.setProperty("--bg", "#f5f5f5");

    applyTheme("light");

    expect(meta.getAttribute("content")).toBe("#f5f5f5");
  });

  it("does nothing (no throw) when there is no theme-color meta tag in the document", () => {
    expect(() => applyTheme("dark")).not.toThrow();
  });

  it("leaves the meta tag's content alone when --bg resolves empty", () => {
    const meta = addThemeColorMeta();
    meta.setAttribute("content", "#0a0c14");

    applyTheme("dark");

    expect(meta.getAttribute("content")).toBe("#0a0c14");
  });
});

describe("setStoredTheme", () => {
  it("persists the theme to localStorage and applies it to the document", () => {
    setStoredTheme("light");

    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("useThemeStore", () => {
  it("seeds theme from getStoredTheme() (OS preference) when nothing is stored", () => {
    stubMatchMedia(true);
    const store = useThemeStore();
    expect(store.theme).toBe("light");
  });

  it("seeds theme from localStorage when an explicit preference was already saved", () => {
    localStorage.setItem(THEME_KEY, "light");
    stubMatchMedia(false); // OS says dark, but the explicit override should win
    const store = useThemeStore();
    expect(store.theme).toBe("light");
  });

  describe("toggle()", () => {
    it("flips dark -> light and persists the change", () => {
      localStorage.setItem(THEME_KEY, "dark");
      const store = useThemeStore();
      expect(store.theme).toBe("dark");

      store.toggle();

      expect(store.theme).toBe("light");
      expect(localStorage.getItem(THEME_KEY)).toBe("light");
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    it("flips light -> dark and persists the change", () => {
      localStorage.setItem(THEME_KEY, "light");
      const store = useThemeStore();
      expect(store.theme).toBe("light");

      store.toggle();

      expect(store.theme).toBe("dark");
      expect(localStorage.getItem(THEME_KEY)).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("toggling twice returns to the original theme", () => {
      localStorage.setItem(THEME_KEY, "dark");
      const store = useThemeStore();

      store.toggle();
      store.toggle();

      expect(store.theme).toBe("dark");
      expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    });
  });
});
