/**
 * Guards against the exact drift that already happened once before this redesign: shareCard.ts's
 * old TIER_COLORS was a hand-copied duplicate of tokens.css's --<tier>-1/-2/-3/-t values that had
 * silently fallen out of sync. lib/tierPalette.ts's TIER_PALETTE is now the single source of truth
 * (shareCard.ts and tierEmblem.ts both import it directly) — this test is the other half: it
 * asserts tokens.css's own hand-authored custom properties, which non-emblem CSS (rank-card.css's
 * tier wash, .panel-reward, .rankbar, App.vue's --tier-accent) still reads directly, haven't
 * drifted from that same source of truth either.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TIERS } from "@liftr/shared";
import { describe, expect, it } from "vitest";
import { TIER_PALETTE } from "~client/lib/tierPalette";

const TOKENS_CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/client/src/styles/tokens.css");

function readCssTierValue(css: string, tier: string, suffix: "1" | "2" | "3" | "t"): string | null {
  const match = new RegExp(`--${tier}-${suffix}:\\s*(#[0-9a-fA-F]{6});`).exec(css);
  return match ? match[1]!.toLowerCase() : null;
}

describe("TIER_PALETTE vs tokens.css", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");

  it.each(TIERS)("tier \"%s\" matches tokens.css's --%s-1/-2/-3/-t custom properties", (tier) => {
    const stops = TIER_PALETTE[tier];
    expect(readCssTierValue(css, tier, "1"), `--${tier}-1 missing or malformed in tokens.css`).toBe(stops.sh.toLowerCase());
    expect(readCssTierValue(css, tier, "2"), `--${tier}-2 missing or malformed in tokens.css`).toBe(stops.base.toLowerCase());
    expect(readCssTierValue(css, tier, "3"), `--${tier}-3 missing or malformed in tokens.css`).toBe(stops.hi.toLowerCase());
    expect(readCssTierValue(css, tier, "t"), `--${tier}-t missing or malformed in tokens.css`).toBe(stops.tint.toLowerCase());
  });
});
