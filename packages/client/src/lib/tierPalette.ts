/**
 * The single source of truth for the 9-tier rank ramp's colors. Nebula-harmonised per the emblem
 * redesign (docs/design/nebula-design-system.md's "tier colors stay independent of Nebula" rule
 * was deliberately revisited for this — see that doc's amendment): bronze/silver/gold read for the
 * bottom three tiers, giving way to an abstract cyan → azure → indigo → violet → magenta →
 * incandescent climb above. Luminance and chroma both rise monotonically tier-to-tier, and every
 * tier shifts hue (not just lightness) between its shadow and highlight stop, which is what keeps
 * the ramp reading as metal/gem material instead of one hue at three lightnesses ("plastic").
 *
 * This used to be duplicated by hand in tokens.css AND in shareCard.ts's own TIER_COLORS constant
 * (which had already drifted out of sync with tokens.css once). This module is now the only place
 * the four hex stops per tier are typed in — tokens.css's `--<tier>-1/-2/-3/-t` custom properties
 * and shareCard.ts's canvas drawing both read from it (tokens.css by literal value, kept in sync by
 * a vitest assertion; shareCard.ts by importing this module directly).
 */
import type { Tier } from "@liftr/shared";

/** sh = shadow stop, base = mid stop, hi = highlight stop, tint = lightest stop (used for glyph
 *  fills, rim highlights, and anywhere a "this tier's bright accent" color is needed standalone). */
export interface TierColorStops {
  sh: string;
  base: string;
  hi: string;
  tint: string;
}

export const TIER_PALETTE: Record<Tier, TierColorStops> = {
  initiate: { sh: "#141a26", base: "#2a3448", hi: "#5a6a88", tint: "#9aa8c4" },
  apprentice: { sh: "#16202f", base: "#2d4260", hi: "#5f86b8", tint: "#a8c4e4" },
  trainee: { sh: "#0f2733", base: "#1d5470", hi: "#3fa0c4", tint: "#9fd8ec" },
  athlete: { sh: "#0d2c3f", base: "#1a6a9e", hi: "#2f9fe0", tint: "#a8ddf7" },
  lifter: { sh: "#0f2246", base: "#1f5bb8", hi: "#3b8cff", tint: "#b3d2ff" },
  advanced: { sh: "#171d4e", base: "#3a44c8", hi: "#6b74ff", tint: "#c3c8ff" },
  elite: { sh: "#231a52", base: "#5b45d4", hi: "#8a6dff", tint: "#cfc4ff" },
  expert: { sh: "#3a1152", base: "#9a2fd6", hi: "#d63aff", tint: "#efc0ff" },
  apex: { sh: "#4a1046", base: "#c23ad0", hi: "#ff7bf0", tint: "#fff0fb" },
};

/** Parses a `#rrggbb` hex string into 0-255 channel values. */
function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(v: number): string {
  return Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, "0");
}

/** Linear-interpolates two hex colors at `t` (0 = a, 1 = b). Used by the emblem geometry generator
 *  to derive per-facet shading from a tier's shadow/highlight stops without needing a 3rd color
 *  library dependency — this is deliberately the only color math the emblem system needs. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `#${toHex(ar + (br - ar) * t)}${toHex(ag + (bg - ag) * t)}${toHex(ab + (bb - ab) * t)}`;
}
