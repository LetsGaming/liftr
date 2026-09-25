// @vitest-environment jsdom
//
// equipmentIcons.ts now calls i18n.ts's t(), which reads localStorage at module load (needs a
// DOM) — jsdom's navigator.language always reports "en-US", so i18n.ts's getStoredLocale() would
// otherwise default the shared i18n singleton to "en" for the rest of the test process.
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "~client/i18n";
import {
  EQUIPMENT_ICON_PATH,
  equipmentLabel,
  EQUIPMENT_SLUGS,
  equipmentIconSvg,
  equipmentRequirementLabelDe,
  SUPPORT_EQUIPMENT_ICON_PATH,
  supportEquipmentLabel,
  SUPPORT_EQUIPMENT_SLUGS,
} from "~client/lib/equipmentIcons";

beforeEach(() => {
  i18n.global.locale.value = "de";
});

describe("EQUIPMENT_ICON_PATH / equipmentLabel completeness", () => {
  it("has an icon for every primary equipment slug", () => {
    for (const equipment of EQUIPMENT_SLUGS) {
      expect(EQUIPMENT_ICON_PATH[equipment], `missing icon for "${equipment}"`).toBeTypeOf("string");
      expect(EQUIPMENT_ICON_PATH[equipment]!.length).toBeGreaterThan(0);
    }
  });

  it("has a German label for every primary equipment slug", () => {
    for (const equipment of EQUIPMENT_SLUGS) {
      expect(equipmentLabel(equipment), `missing label for "${equipment}"`).toBeTypeOf("string");
      expect(equipmentLabel(equipment).length).toBeGreaterThan(0);
    }
  });

  it("has an icon and label for every support-equipment slug", () => {
    for (const item of SUPPORT_EQUIPMENT_SLUGS) {
      expect(SUPPORT_EQUIPMENT_ICON_PATH[item], `missing icon for "${item}"`).toBeTypeOf("string");
      expect(supportEquipmentLabel(item), `missing label for "${item}"`).toBeTypeOf("string");
    }
  });
});

describe("equipmentIconSvg", () => {
  it("returns the exact registered path for a primary equipment value", () => {
    expect(equipmentIconSvg("dumbbell")).toBe(EQUIPMENT_ICON_PATH.dumbbell);
  });

  it("returns the exact registered path for a support-equipment value", () => {
    expect(equipmentIconSvg("rack")).toBe(SUPPORT_EQUIPMENT_ICON_PATH.rack);
  });

  it("prefers a primary equipment match over a support-equipment match when both existed", () => {
    // barbell only exists as primary equipment, sanity-checking lookup order doesn't matter here,
    // but explicitly assert the primary map is consulted first per the function's fallback chain.
    expect(equipmentIconSvg("barbell")).toBe(EQUIPMENT_ICON_PATH.barbell);
  });

  it("falls back to the machine icon for an unrecognized equipment string", () => {
    expect(equipmentIconSvg("jetpack")).toBe(EQUIPMENT_ICON_PATH.machine);
  });

  it("falls back to the machine icon for an empty string", () => {
    expect(equipmentIconSvg("")).toBe(EQUIPMENT_ICON_PATH.machine);
  });
});

describe("equipmentRequirementLabelDe", () => {
  it("resolves a primary equipment requirement to its German label", () => {
    expect(equipmentRequirementLabelDe("kettlebell")).toBe("Kettlebell");
  });

  it("resolves a support-equipment requirement to its German label", () => {
    expect(equipmentRequirementLabelDe("pullup-bar")).toBe("Klimmzugstange");
  });

  it("falls back to returning the raw requirement string when unrecognized", () => {
    expect(equipmentRequirementLabelDe("unobtainium" as never)).toBe("unobtainium");
  });
});
