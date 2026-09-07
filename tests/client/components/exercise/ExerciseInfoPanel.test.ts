import { flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getExerciseHistoryMock, getRanksMock } = vi.hoisted(() => ({
  getExerciseHistoryMock: vi.fn(),
  getRanksMock: vi.fn(),
}));
vi.mock("~client/services/exerciseService", () => ({ getExerciseHistory: getExerciseHistoryMock }));
vi.mock("~client/services/rankService", () => ({ getRanks: getRanksMock }));

import ExerciseInfoPanel from "~client/components/exercise/ExerciseInfoPanel.vue";
import { i18n } from "~client/i18n";
import { useRanksStore, type RankRow } from "~client/stores/ranksStore";
import { useSettingsStore } from "~client/stores/settingsStore";
import type { CatalogExercise } from "~client/stores/catalogStore";
import type { ExerciseHistorySet } from "~client/services/exerciseService";
import { createTestRouter, mountWithProviders } from "../../helpers/mountWithProviders";

function makeExercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: "ex-1",
    slug: "bench-press",
    name: null,
    equipment: "barbell",
    requiredEquipment: [],
    movementPattern: "push",
    isBodyweight: false,
    isCustom: false,
    demoStartImage: null,
    demoEndImage: null,
    howToKey: null,
    hasImage: true,
    muscles: [{ slug: "chest", role: "primary" }, { slug: "triceps", role: "secondary" }],
    ...overrides,
  };
}

function makeHistorySet(overrides: Partial<ExerciseHistorySet> = {}): ExerciseHistorySet {
  return { setIndex: 0, weightKg: 60, reps: 5, loggedAt: "2026-01-01T10:00:00.000Z", isWarmup: false, ...overrides };
}

function makeRank(overrides: Partial<RankRow> = {}): RankRow {
  return {
    exerciseId: "ex-1",
    slug: "bench-press",
    name: null,
    isBodyweight: false,
    tier: "trainee",
    division: 2,
    lp: 40,
    e1rm: 70,
    trust: "real",
    nextTargetWeightKg: 75,
    nextTargetReps: 5,
    peakTier: null,
    peakDivision: null,
    ...overrides,
  };
}

/** SheetModal (this component's shell) is built on @ionic/vue's real <IonModal>, whose Stencil
 *  custom element never upgrades under jsdom — it renders no slotted content at all without it
 *  (confirmed: mounting SheetModal unstubbed produces an empty <ion-modal></ion-modal>). Stubbing
 *  just IonModal (not SheetModal itself, which still runs its own real header/body wiring) is the
 *  targeted fix tests/README.md's "stub that specific element" guidance describes. */
const IonModalStub = { template: "<div><slot /></div>" };

function mountPanel(exercise: CatalogExercise, opts: { ownedEquipment?: string[] | null; ranks?: RankRow[]; ranksLoaded?: boolean } = {}) {
  const pinia = createPinia();
  useSettingsStore(pinia).ownedEquipment = opts.ownedEquipment ?? null;
  const ranksStore = useRanksStore(pinia);
  ranksStore.ranks = opts.ranks ?? [];
  ranksStore.loaded = opts.ranksLoaded ?? false;
  const wrapper = mountWithProviders(ExerciseInfoPanel, {
    props: { exercise },
    global: { plugins: [pinia, i18n, createTestRouter()], stubs: { IonModal: IonModalStub } },
  });
  return { wrapper, ranksStore };
}

beforeEach(() => {
  getExerciseHistoryMock.mockReset();
  getRanksMock.mockReset();
  getExerciseHistoryMock.mockResolvedValue([]);
  getRanksMock.mockResolvedValue([]);
});

describe("ExerciseInfoPanel", () => {
  it("shows the exercise's i18n display name in the header, and a custom exercise's literal name", () => {
    const { wrapper } = mountPanel(makeExercise());
    expect(wrapper.find(".sheet-head b").text()).toBe("Bankdrücken");

    const { wrapper: customWrapper } = mountPanel(makeExercise({ slug: "my-custom-lift", name: "Mein Lift" }));
    expect(customWrapper.find(".sheet-head b").text()).toBe("Mein Lift");
  });

  it("defaults to the Über tab, marked active", () => {
    const { wrapper } = mountPanel(makeExercise());

    const tabs = wrapper.findAll(".tab-pill");
    expect(tabs.map((t) => t.text())).toEqual(["Über", "Rang", "Statistiken", "Verlauf"]);
    expect(tabs[0]!.classes()).toContain("active");
    expect(tabs[0]!.attributes("aria-selected")).toBe("true");
    expect(tabs[1]!.attributes("aria-selected")).toBe("false");
  });

  it("clicking the close button emits close", async () => {
    const { wrapper } = mountPanel(makeExercise());

    await wrapper.find(".btn-close").trigger("click");

    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("Über tab shows the exercise demo and its i18n how-to text", () => {
    const { wrapper } = mountPanel(makeExercise());

    expect(wrapper.find(".exercise-demo, .demo-stage").exists()).toBe(true);
    expect(wrapper.find(".howto").text()).toBe(
      "Ellenbogen ca. 45° zum Körper, kontrolliert ablassen, ohne Schwung drücken — die Brust arbeitet.",
    );
  });

  it("Über tab lists required equipment and flags what's missing against owned equipment", () => {
    const exercise = makeExercise({
      requiredEquipment: [
        { item: "barbell", tier: "required" },
        { item: "bench", tier: "recommended" },
      ],
    });
    const { wrapper } = mountPanel(exercise, { ownedEquipment: ["dumbbell"] });

    const chips = wrapper.findAll(".equipment-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0]!.text()).toContain("Langhantel");
    expect(chips[0]!.classes()).toContain("missing");
    expect(chips[0]!.find(".missing-badge").text()).toBe("fehlt");
    expect(chips[1]!.text()).toContain("Flachbank");
    expect(chips[1]!.classes()).toContain("soft");
    expect(chips[1]!.find(".missing-badge").text()).toBe("empfohlen");
  });

  it("Über tab shows no missing badge for equipment the user owns", () => {
    const exercise = makeExercise({ requiredEquipment: [{ item: "barbell", tier: "required" }] });
    const { wrapper } = mountPanel(exercise, { ownedEquipment: ["barbell"] });

    const chip = wrapper.find(".equipment-chip");
    expect(chip.classes()).not.toContain("missing");
    expect(chip.find(".missing-badge").exists()).toBe(false);
  });

  it("switching to a non-Über tab lazily fetches this exercise's history exactly once", async () => {
    const { wrapper } = mountPanel(makeExercise());
    expect(getExerciseHistoryMock).not.toHaveBeenCalled();

    await wrapper.findAll(".tab-pill")[3]!.trigger("click"); // Verlauf
    await flushPromises();
    expect(getExerciseHistoryMock).toHaveBeenCalledWith("ex-1");
    expect(getExerciseHistoryMock).toHaveBeenCalledTimes(1);

    await wrapper.findAll(".tab-pill")[0]!.trigger("click"); // back to Über
    await wrapper.findAll(".tab-pill")[3]!.trigger("click"); // Verlauf again
    await flushPromises();
    expect(getExerciseHistoryMock).toHaveBeenCalledTimes(1); // cached, not refetched
  });

  it("Verlauf tab renders the fetched sets via ExerciseHistoryList", async () => {
    getExerciseHistoryMock.mockResolvedValue([makeHistorySet({ weightKg: 80, reps: 3 })]);
    const { wrapper } = mountPanel(makeExercise());

    await wrapper.findAll(".tab-pill")[3]!.trigger("click");
    await flushPromises();

    expect(wrapper.find(".set-value").text()).toBe("80 kg × 3");
  });

  it("Rang tab shows a loading hint, then triggers ranksStore.load() and renders the matching rank", async () => {
    // A deferred promise (rather than an already-resolved mock) makes the transient "Lädt…"
    // state deterministic instead of racing ranksStore.load()'s own microtask against Vue's
    // render flush.
    let resolveRanks!: (ranks: RankRow[]) => void;
    getRanksMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRanks = resolve;
      }),
    );
    const { wrapper, ranksStore } = mountPanel(makeExercise(), { ranksLoaded: false });

    await wrapper.findAll(".tab-pill")[1]!.trigger("click"); // Rang
    expect(wrapper.find(".hint").text()).toBe("Lädt…");
    expect(getRanksMock).toHaveBeenCalledTimes(1);

    resolveRanks([makeRank({ exerciseId: "ex-1", tier: "trainee", division: 2, lp: 40 })]);
    await flushPromises();

    expect(ranksStore.loaded).toBe(true);
    expect(wrapper.find(".rank-card-frame").exists()).toBe(true);
    expect(wrapper.text()).toContain("40 LP");
  });

  it("Rang tab shows the 'no rank yet' hint once loaded with no matching row", async () => {
    const { wrapper } = mountPanel(makeExercise({ id: "ex-no-rank" }), { ranksLoaded: true, ranks: [] });

    await wrapper.findAll(".tab-pill")[1]!.trigger("click");

    expect(wrapper.find(".rank-card-frame").exists()).toBe(false);
    expect(wrapper.find(".hint").text()).toBe(
      "Noch kein Rang — er entsteht aus deinem besten Satz, sobald du diese Übung einmal trainiert hast.",
    );
    expect(getRanksMock).not.toHaveBeenCalled(); // already loaded, no refetch
  });

  it("Rang tab does not refetch ranks once already loaded", async () => {
    const { wrapper } = mountPanel(makeExercise(), { ranksLoaded: true, ranks: [makeRank()] });

    await wrapper.findAll(".tab-pill")[1]!.trigger("click");

    expect(getRanksMock).not.toHaveBeenCalled();
    expect(wrapper.find(".rank-card-frame").exists()).toBe(true);
  });

  it("Statistiken tab computes best e1RM, lifetime volume, and total sets logged (loaded lift)", async () => {
    getExerciseHistoryMock.mockResolvedValue([
      makeHistorySet({ weightKg: 60, reps: 5, isWarmup: true }), // warmup: excluded from best/volume, counted in total
      makeHistorySet({ weightKg: 60, reps: 5, isWarmup: false }), // e1rm = 60*(1+5/30) = 70
      makeHistorySet({ weightKg: 70, reps: 3, isWarmup: false }), // e1rm = 70*(1+3/30) = 77 (best)
    ]);
    const { wrapper } = mountPanel(makeExercise({ isBodyweight: false }));

    await wrapper.findAll(".tab-pill")[2]!.trigger("click"); // Statistiken
    await flushPromises();

    const tiles = wrapper.findAll(".stat-row .stat-tile b");
    expect(tiles[0]!.text()).toBe("77 kg"); // best e1RM, rounded
    expect(tiles[1]!.text()).toBe("510 kg"); // (60*5 + 70*3), warmup excluded
    expect(tiles[2]!.text()).toBe("3"); // every logged set, warmups included
  });

  it("Statistiken tab reports best reps (not e1RM) for a bodyweight exercise", async () => {
    getExerciseHistoryMock.mockResolvedValue([
      makeHistorySet({ weightKg: null, reps: 15, isWarmup: true }),
      makeHistorySet({ weightKg: null, reps: 12, isWarmup: false }),
      makeHistorySet({ weightKg: null, reps: 18, isWarmup: false }),
    ]);
    const { wrapper } = mountPanel(makeExercise({ isBodyweight: true }));

    await wrapper.findAll(".tab-pill")[2]!.trigger("click");
    await flushPromises();

    expect(wrapper.findAll(".stat-row .stat-tile b")[0]!.text()).toBe("18 Wdh.");
  });

  it("Statistiken tab shows a dash placeholder when there's no non-warmup history yet", async () => {
    getExerciseHistoryMock.mockResolvedValue([]);
    const { wrapper } = mountPanel(makeExercise());

    await wrapper.findAll(".tab-pill")[2]!.trigger("click");
    await flushPromises();

    const tiles = wrapper.findAll(".stat-row .stat-tile b");
    expect(tiles[0]!.text()).toBe("–");
    expect(tiles[2]!.text()).toBe("0");
  });
});
