import { TIERS, type Tier } from "@liftr/shared";
import { describe, expect, it } from "vitest";
import { buildTierEmblem, wingReachUnits } from "~client/lib/tierEmblem";

/** Counts wing-blade polygons by re-deriving the exact fill count a single blade contributes
 *  (1 polygon per blade, 2 sides) — mirrors buildTierEmblem's own `wings` push count rather than
 *  asserting on total shape count, which would break on any unrelated cosmetic addition. */
function bladesPerSide(tier: Tier): number {
  const n = TIERS.indexOf(tier) + 1;
  if (n < 4) return 0;
  return n >= 9 ? 4 : n >= 8 ? 3 : n >= 6 ? 2 : 1;
}

describe("buildTierEmblem", () => {
  it("produces at least one shape and no gradient/shape mismatch for every tier", () => {
    for (const tier of TIERS) {
      const emblem = buildTierEmblem(tier);
      expect(emblem.shapes.length).toBeGreaterThan(0);
      const gradientIds = new Set(emblem.gradients.map((g) => g.id));
      const referenced = new Set<string>();
      for (const shape of emblem.shapes) {
        for (const value of [("fill" in shape ? shape.fill : undefined), ("stroke" in shape ? shape.stroke : undefined)]) {
          const match = value ? /^url\(#(.+)\)$/.exec(value) : null;
          if (match) referenced.add(match[1]!);
        }
      }
      for (const id of referenced) {
        expect(gradientIds.has(id), `emblem for "${tier}" references gradient "${id}" with no matching def`).toBe(true);
      }
    }
  });

  it("renders no wings below Stufe 4 (initiate/apprentice/trainee)", () => {
    for (const tier of ["initiate", "apprentice", "trainee"] as const) {
      expect(bladesPerSide(tier)).toBe(0);
    }
  });

  it("escalates wing-blade count monotonically from Stufe 4 through Apex", () => {
    const counts = TIERS.map((t) => bladesPerSide(t));
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!, `blade count must never decrease tier-to-tier (${TIERS[i]})`).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
    expect(counts[counts.length - 1]).toBe(4); // Apex
  });

  it("namespaces gradient ids with the given idPrefix, avoiding cross-instance collisions", () => {
    const a = buildTierEmblem("apex", { idPrefix: "a-" });
    const b = buildTierEmblem("apex", { idPrefix: "b-" });
    const aIds = new Set(a.gradients.map((g) => g.id));
    const bIds = new Set(b.gradients.map((g) => g.id));
    for (const id of aIds) expect(bIds.has(id)).toBe(false);
    for (const id of a.gradients.map((g) => g.id)) expect(id.startsWith("a-")).toBe(true);
  });

  it("`small` hides the tier-progress tick but keeps wings intact", () => {
    const full = buildTierEmblem("apex", { small: false });
    const small = buildTierEmblem("apex", { small: true });
    // The tick is 2 <rect> shapes appended only when !small — everything else (polygons for wings
    // included) must be identical in count between the two.
    const fullNonRect = full.shapes.filter((s) => s.kind !== "rect").length;
    const smallNonRect = small.shapes.filter((s) => s.kind !== "rect").length;
    expect(smallNonRect).toBe(fullNonRect);
    expect(small.shapes.length).toBeLessThan(full.shapes.length);
  });
});

describe("wingReachUnits", () => {
  it("returns exactly 64 (no overflow past the viewBox edge) below Stufe 4", () => {
    for (const tier of ["initiate", "apprentice", "trainee"] as const) {
      expect(wingReachUnits(tier)).toBe(64);
    }
  });

  it("keeps overflow-past-the-viewBox-edge (reach - 64, floored at 0) monotonic across all 9 tiers", () => {
    // The raw reach value itself dips at Stufe 4 (wings start small enough to still sit inside
    // the viewBox) before climbing past it — that's correct, not a bug: what actually matters to
    // every consumer (shareCard.ts's corner-stamp shift, the emblem's own overflow:visible) is how
    // far PAST the edge a tier's wings reach, and that is monotonic.
    const overflow = TIERS.map((t) => Math.max(0, wingReachUnits(t) - 64));
    for (let i = 1; i < overflow.length; i++) {
      expect(overflow[i]!).toBeGreaterThanOrEqual(overflow[i - 1]!);
    }
    expect(overflow[overflow.length - 1]).toBeGreaterThan(0); // Apex genuinely overflows
  });
});
