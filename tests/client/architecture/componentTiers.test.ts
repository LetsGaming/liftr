import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural rules from docs/adr/0012-component-tiers.md that ESLint's per-file `files` globs
 * can't see (they need to look at a whole directory, or cross-reference two directories) — the
 * import-direction half of the same rules lives in eslint.config.js's no-restricted-imports
 * blocks. Every assertion failure names the ADR rule it enforces, not just what failed.
 */

const CLIENT_SRC = resolve(__dirname, "../../../packages/client/src");
const COMPONENTS = join(CLIENT_SRC, "components");
const PAGES = join(CLIENT_SRC, "pages");

function vueFilesIn(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".vue"));
}

function importSpecifiers(filePath: string): string[] {
  const src = readFileSync(filePath, "utf8");
  const matches = src.matchAll(/^\s*import\s+(?:type\s+)?[^;]*?\sfrom\s+["']([^"']+)["']/gm);
  return [...matches].map((m) => m[1] ?? "");
}

describe("component tier discipline (docs/adr/0012-component-tiers.md)", () => {
  it("has no barrel index.ts in components/base or components/patterns", () => {
    for (const tier of ["base", "patterns"]) {
      const files = readdirSync(join(COMPONENTS, tier));
      expect(
        files.includes("index.ts"),
        `components/${tier}/index.ts would barrel-import every primitive into the first chunk ` +
          `that touches one, defeating per-route code-splitting — ADR 0012 forbids it.`,
      ).toBe(false);
    }
  });

  it("gives every feature-tier folder at least 2 files", () => {
    const tierDirs = new Set(["base", "patterns"]);
    const entries = readdirSync(COMPONENTS, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && !tierDirs.has(e.name),
    );
    for (const dir of entries) {
      const count = readdirSync(join(COMPONENTS, dir.name)).length;
      expect(
        count,
        `components/${dir.name}/ has ${count} file(s) — ADR 0012 requires a components/ folder ` +
          `be keyed by a domain noun and never hold fewer than 2 files; a single-file folder ` +
          `should dissolve into its parent domain folder instead.`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps components/base composing zero other Liftr components", () => {
    const baseDir = join(COMPONENTS, "base");
    for (const file of vueFilesIn(baseDir)) {
      const specifiers = importSpecifiers(join(baseDir, file));
      const liftrComponentImports = specifiers.filter((s) => s.startsWith(".") && s.endsWith(".vue"));
      expect(
        liftrComponentImports,
        `components/base/${file} imports another Liftr component (${liftrComponentImports.join(", ")}) — ` +
          `ADR 0012: base/ is one control, zero composition of other Liftr components.`,
      ).toEqual([]);
    }
  });

  it("keeps every routed page 1:1 with router.ts", () => {
    const routerSrc = readFileSync(join(CLIENT_SRC, "router.ts"), "utf8");
    const routedPages = new Set(
      [...routerSrc.matchAll(/["']\.\/pages\/([^"']+\.vue)["']/g)].map((m) => m[1] ?? ""),
    );
    const pageFiles = new Set(vueFilesIn(PAGES));

    for (const file of pageFiles) {
      expect(
        routedPages.has(file),
        `pages/${file} exists but router.ts never imports it — ADR 0012: pages/ is routed, 1:1 with router.ts.`,
      ).toBe(true);
    }
    for (const file of routedPages) {
      expect(
        pageFiles.has(file),
        `router.ts imports ./pages/${file} but that file doesn't exist in pages/.`,
      ).toBe(true);
    }
  });
});
