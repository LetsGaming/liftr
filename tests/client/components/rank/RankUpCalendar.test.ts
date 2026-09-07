// vi.mock() is hoisted above imports, but a same-file const the factory reads is not — wrap it
// in vi.hoisted() (tests/README.md) so getRankEventsMock exists by the time the mock runs.
const { getRankEventsMock } = vi.hoisted(() => ({ getRankEventsMock: vi.fn() }));
vi.mock("~client/services/rankEventsService", () => ({ getRankEvents: getRankEventsMock }));

import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RankUpCalendar from "~client/components/rank/RankUpCalendar.vue";
import type { RankEventsByWeekday } from "~client/services/rankEventsService";
import { i18n } from "~client/i18n";
import { createTestRouter, mountWithProviders } from "../../helpers/mountWithProviders";

beforeEach(() => {
  getRankEventsMock.mockReset();
});

async function mountCalendar(byWeekday: RankEventsByWeekday[]) {
  getRankEventsMock.mockResolvedValue(byWeekday);
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mountWithProviders(RankUpCalendar, {
    global: { plugins: [pinia, i18n, createTestRouter()] },
  });
  await flushPromises();
  return wrapper;
}

describe("RankUpCalendar", () => {
  it("renders nothing before the initial load resolves", () => {
    getRankEventsMock.mockReturnValue(new Promise(() => {})); // never resolves
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mountWithProviders(RankUpCalendar, {
      global: { plugins: [pinia, i18n, createTestRouter()] },
    });

    expect(wrapper.find(".rankup-calendar").exists()).toBe(false);
  });

  it("renders 7 days Mo-So in that order, regardless of the JS getDay()-indexed input order", async () => {
    const wrapper = await mountCalendar([
      { weekday: 0, count: 1, flaggedCount: 0 },
      { weekday: 3, count: 2, flaggedCount: 0 },
    ]);

    const days = wrapper.findAll(".streak-day");
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.find(".dl").text())).toEqual(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
  });

  it("shows the empty-week message and no counts when there are no rank-ups at all", async () => {
    const wrapper = await mountCalendar([]);

    expect(wrapper.find(".ruc-empty").exists()).toBe(true);
    expect(wrapper.text()).toContain("Dein nächster Rangaufstieg wartet — leg los!");
    for (const dot of wrapper.findAll(".dot")) {
      expect(dot.text()).toBe("");
      expect(dot.classes()).not.toContain("active");
      expect(dot.classes()).not.toContain("flagged");
    }
    expect(wrapper.find(".nebula-dot").exists()).toBe(false);
  });

  it("renders a genuine (non-fully-flagged) day as 'active' with a count and a nebula accent", async () => {
    const wrapper = await mountCalendar([{ weekday: 1, count: 3, flaggedCount: 1 }]);

    const monday = wrapper.findAll(".streak-day")[0]!; // Mo is first in MO_SO_ORDER
    expect(monday.find(".dl").text()).toBe("Mo");
    expect(monday.find(".dot").text()).toBe("3");
    expect(monday.find(".dot").classes()).toContain("active");
    expect(monday.find(".dot").classes()).not.toContain("flagged");
    expect(monday.find(".nebula-dot").exists()).toBe(true);
    expect(wrapper.find(".ruc-empty").exists()).toBe(false);
  });

  it("renders a fully-flagged day (every rank-up plausibility-flagged) as muted, not celebrated", async () => {
    const wrapper = await mountCalendar([{ weekday: 0, count: 2, flaggedCount: 2 }]);

    const sunday = wrapper.findAll(".streak-day")[6]!; // So is last in MO_SO_ORDER
    expect(sunday.find(".dl").text()).toBe("So");
    expect(sunday.find(".dot").text()).toBe("2");
    expect(sunday.find(".dot").classes()).toContain("flagged");
    expect(sunday.find(".dot").classes()).not.toContain("active");
    expect(sunday.find(".nebula-dot").exists()).toBe(false);
  });

  it("shows a blank dot (no count text) for a weekday with zero rank-ups, alongside days that have some", async () => {
    const wrapper = await mountCalendar([{ weekday: 2, count: 1, flaggedCount: 0 }]);

    const monday = wrapper.findAll(".streak-day")[0]!; // Mo has no row -> defaults to count 0
    expect(monday.find(".dot").text()).toBe("");
    expect(monday.find(".dot").classes()).not.toContain("active");
    expect(monday.find(".dot").classes()).not.toContain("flagged");
  });
});
