// @vitest-environment jsdom
//
// FinishSequence orchestrates three timed beats via useCelebrate (setInterval-polled waits,
// already covered on its own in tests/client/composables/useCelebrate.test.ts) plus two flavors
// of rAF-driven number/bar animation (useCountUp, and this component's own
// animateRankUpBars()). vi.useFakeTimers() drives the beat timing deterministically (same
// technique as useCelebrate's own tests); requestAnimationFrame/performance.now are stubbed
// manually with an id->callback map + controllable clock (same technique as
// tests/client/composables/useCountUp.test.ts), stubbed *after* useFakeTimers() so this
// explicit stub wins over anything vitest's fake-timer install may itself have patched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import FinishSequence, { type RankUpSummary, type StreakDay } from "~client/components/workout/FinishSequence.vue";
import { haptics } from "~client/lib/haptics";
import { mountWithProviders } from "../../helpers/mountWithProviders";

let rafCallbacks: Map<number, FrameRequestCallback>;
let rafNextId: number;
let nowValue: number;

function flushRafOnce(advanceMs = 2000) {
  nowValue += advanceMs;
  const pending = [...rafCallbacks.values()];
  rafCallbacks.clear();
  pending.forEach((cb) => cb(nowValue));
}

/** Repeatedly flushes pending animation frames (jumping the clock far enough to finish any
 *  single frame's animation in one step) and lets Vue's watchers react in between — needed
 *  because FinishSequence's beat-3 watcher schedules a *nested* rAF that only assigns the
 *  useCountUp targets, which themselves only schedule their own rAFs once their own `watch`
 *  fires on the next microtask. */
async function settleAnimations(maxRounds = 10) {
  for (let i = 0; i < maxRounds; i++) {
    if (rafCallbacks.size === 0) {
      await nextTick();
      if (rafCallbacks.size === 0) return;
    }
    flushRafOnce();
    await nextTick();
  }
}

function stubMatchMedia(reducedMotion: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: reducedMotion }) as unknown as typeof matchMedia);
}

beforeEach(() => {
  vi.useFakeTimers();
  stubMatchMedia(false);
  rafCallbacks = new Map();
  rafNextId = 0;
  nowValue = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      const id = ++rafNextId;
      rafCallbacks.set(id, cb);
      return id;
    }) as unknown as typeof requestAnimationFrame,
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      rafCallbacks.delete(id);
    }) as unknown as typeof cancelAnimationFrame,
  );
  vi.spyOn(performance, "now").mockImplementation(() => nowValue);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function rankUp(overrides: Partial<RankUpSummary> = {}): RankUpSummary {
  return {
    exerciseName: "Bankdrücken",
    tier: "athlete",
    division: 2,
    isPr: false,
    lp: 40,
    prevLp: 10,
    plausibilityNote: null,
    ...overrides,
  };
}

function streakDays(activeCount: number): StreakDay[] {
  return Array.from({ length: 7 }, (_, i) => ({ label: `T${i}`, active: i < activeCount }));
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    rankUps: [] as RankUpSummary[],
    streak: 3,
    streakDays: streakDays(3),
    tokensRemaining: 2,
    sessionXp: 120,
    consistencyBonusXp: 30,
    varietyBonusXp: 0,
    newMuscleSlugs: [] as string[],
    levelBefore: 4,
    levelAfter: 4,
    progressBefore: 40,
    progressAfter: 70,
    ...overrides,
  };
}

describe("FinishSequence", () => {
  it("skips Beat 1 (Rangaufstiege) entirely when the session had no rank-ups — Beat 2 (Serie) is first", async () => {
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ rankUps: [] }) });
    await vi.advanceTimersByTimeAsync(0);

    expect(wrapper.find(".rankup-list").exists()).toBe(false);
    expect(wrapper.find(".streak-num").exists()).toBe(true);
    expect(wrapper.find(".streak-num").text()).toContain("3");
  });

  it("shows Beat 1 first when there are rank-ups, listing each with its tier/label", async () => {
    const rankUps = [rankUp({ exerciseName: "Bankdrücken", tier: "athlete", division: 2 }), rankUp({ exerciseName: "Kniebeuge", tier: "lifter", division: 1, isPr: true })];
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ rankUps }) });
    await vi.advanceTimersByTimeAsync(0);

    const rows = wrapper.findAll(".rankup-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("Bankdrücken");
    expect(rows[0]!.text()).toContain("SPORTLER II"); // not a PR: tier + division label
    expect(rows[1]!.text()).toContain("Kniebeuge");
    expect(rows[1]!.text()).toContain("Neuer Rekord"); // isPr: true overrides the tier/division label
  });

  it("stages the sequence's background on the highest genuine tier among this session's rank-ups", async () => {
    // TIERS order (shared/rank/tiers.ts): ... trainee < athlete < lifter < advanced ... — lifter
    // outranks both athlete and trainee here.
    const rankUps = [rankUp({ tier: "athlete" }), rankUp({ tier: "lifter" }), rankUp({ tier: "trainee" })];
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ rankUps }) });
    await vi.advanceTimersByTimeAsync(0);

    expect(wrapper.find(".finish-seq").classes()).toContain("t-lifter");
  });

  it("falls back to no tier class when every rank-up this session was plausibility-discounted", async () => {
    const rankUps = [rankUp({ tier: "apex", plausibilityNote: "Nicht vollständig gewertet." })];
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ rankUps }) });
    await vi.advanceTimersByTimeAsync(0);

    expect(wrapper.find(".finish-seq").classes()).not.toContain("t-apex");
  });

  it("marks a discounted rank-up row distinctly (muted ring, note, discounted class) instead of rendering it like a genuine one", async () => {
    const rankUps = [rankUp({ exerciseName: "Genuine", plausibilityNote: null }), rankUp({ exerciseName: "Discounted", plausibilityNote: "Nicht vollständig gewertet." })];
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ rankUps }) });
    await vi.advanceTimersByTimeAsync(0);

    const rows = wrapper.findAll(".rankup-row");
    expect(rows[0]!.classes()).not.toContain("discounted");
    expect(rows[0]!.find(".badge-ring").exists()).toBe(true);
    expect(rows[0]!.find(".plausibility-note").exists()).toBe(false);

    expect(rows[1]!.classes()).toContain("discounted");
    expect(rows[1]!.find(".badge-ring-muted").exists()).toBe(true);
    expect(rows[1]!.find(".plausibility-note").text()).toBe("Nicht vollständig gewertet.");
  });

  it("shows the Records link only when this session actually set a PR, and it's tappable without also skipping the beat", async () => {
    const withPr = mountWithProviders(FinishSequence, { props: baseProps({ rankUps: [rankUp({ isPr: true })] }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(withPr.find("a.btn-secondary").exists()).toBe(true);

    const withoutPr = mountWithProviders(FinishSequence, { props: baseProps({ rankUps: [rankUp({ isPr: false })] }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(withoutPr.find("a.btn-secondary").exists()).toBe(false);
  });

  it("animates each rank-up's bar from prevLp to lp (not an instant jump)", async () => {
    const rankUps = [rankUp({ prevLp: 10, lp: 90 })];
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ rankUps }) });
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();

    const barFill = () => wrapper.find(".rankup-row .bar-fill");
    // Before the rAF fires, the bar sits at its start value (prevLp).
    expect(barFill().attributes("style")).toContain("scaleX(0.1)");

    await settleAnimations();
    // Once the animation completes, it lands exactly on the target (lp).
    expect(barFill().attributes("style")).toContain("scaleX(0.9)");
  });

  it("Beat 2 (Serie) shows the streak count, one dot per day (active ones flagged), and a tokens-remaining note", async () => {
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ streak: 5, streakDays: streakDays(5), tokensRemaining: 1 }) });
    // No rankUps -> Beat 1 is skipped entirely, so Beat 2 is already active at t=0.
    await vi.advanceTimersByTimeAsync(0);

    expect(wrapper.find(".streak-num").text()).toContain("5");
    const dots = wrapper.findAll(".streak-day .dot");
    expect(dots).toHaveLength(7);
    expect(dots.filter((d) => d.classes().includes("active"))).toHaveLength(5);
    expect(wrapper.find(".streak-note").text()).toBe("Deine Serie übersteht noch 1 Ruhetage.");
  });

  it("omits the tokens-remaining note once tokensRemaining reaches 0", async () => {
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ tokensRemaining: 0 }) });
    await vi.advanceTimersByTimeAsync(0);

    expect(wrapper.find(".streak-note").exists()).toBe(false);
  });

  it("Beat 3 (Fortschritt) shows the set-XP and consistency-XP lines but omits variety when its bonus is 0", async () => {
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ varietyBonusXp: 0, newMuscleSlugs: [] }) });
    // Beat 2's default holdMs is 1600ms; advance past it to reach Beat 3.
    await vi.advanceTimersByTimeAsync(1650);

    const lines = wrapper.findAll(".xp-line");
    expect(lines).toHaveLength(2); // set XP + consistency XP only
    expect(wrapper.text()).not.toContain("zum ersten Mal seit letztem Training");
  });

  it("Beat 3 shows the variety-XP line, naming the newly-trained muscle(s), when its bonus is > 0", async () => {
    const wrapper = mountWithProviders(FinishSequence, {
      props: baseProps({ varietyBonusXp: 15, newMuscleSlugs: ["chest", "triceps"] }),
    });
    await vi.advanceTimersByTimeAsync(1650);

    const lines = wrapper.findAll(".xp-line");
    expect(lines).toHaveLength(3);
    expect(wrapper.text()).toContain("Brust und Trizeps zum ersten Mal seit letztem Training");
  });

  it("Beat 3 rolls the XP counters and level bar up to their real values once settled", async () => {
    const wrapper = mountWithProviders(FinishSequence, {
      props: baseProps({ sessionXp: 120, consistencyBonusXp: 30, varietyBonusXp: 0, levelBefore: 4, levelAfter: 4, progressAfter: 70 }),
    });
    await vi.advanceTimersByTimeAsync(1650);
    await settleAnimations();

    const lines = wrapper.findAll(".xp-line");
    expect(lines[0]!.text()).toContain("+120 XP");
    expect(lines[1]!.text()).toContain("+30 XP");
    expect(wrapper.find(".level-bar .bar-fill").attributes("style")).toContain("scaleX(0.7)");
  });

  it("shows a level-up stamp (not the plain level line) and fires a success haptic when the session leveled up", async () => {
    const successSpy = vi.spyOn(haptics, "success").mockResolvedValue(undefined);
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ levelBefore: 4, levelAfter: 5 }) });
    await vi.advanceTimersByTimeAsync(1650);

    expect(wrapper.find(".level-up").exists()).toBe(true);
    expect(wrapper.find(".level-up").text()).toBe("LEVEL 5!");
    expect(wrapper.find(".level-line").exists()).toBe(false);
    expect(successSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the plain level line and does not haptic when the session did not level up", async () => {
    const successSpy = vi.spyOn(haptics, "success").mockResolvedValue(undefined);
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ levelBefore: 4, levelAfter: 4 }) });
    await vi.advanceTimersByTimeAsync(1650);

    expect(wrapper.find(".level-up").exists()).toBe(false);
    expect(wrapper.find(".level-line").text()).toBe("Lv. 4");
    expect(successSpy).not.toHaveBeenCalled();
  });

  it("tapping (or Enter/Space on) the root advances past the current beat immediately, without waiting out its full holdMs", async () => {
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps({ tokensRemaining: 0 }) }); // starts on Beat 2 (no rankUps)
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.find(".streak-num").exists()).toBe(true);

    await wrapper.find(".finish-seq").trigger("click");
    await vi.advanceTimersByTimeAsync(50); // wait()'s poll interval notices the skip flag

    expect(wrapper.find(".streak-num").exists()).toBe(false);
    expect(wrapper.find(".xp-breakdown").exists()).toBe(true); // Beat 3 reached well before its 1600ms hold
  });

  it("emits done once the whole sequence finishes running", async () => {
    const wrapper = mountWithProviders(FinishSequence, { props: baseProps() });

    await vi.advanceTimersByTimeAsync(0); // Beat 2 (no rankUps)
    expect(wrapper.emitted("done")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1600); // -> Beat 3
    expect(wrapper.emitted("done")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1800); // Beat 3's own holdMs runs out
    expect(wrapper.emitted("done")).toHaveLength(1);
  });
});
