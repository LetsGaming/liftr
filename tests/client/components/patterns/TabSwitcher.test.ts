import { describe, expect, it } from "vitest";
import TabSwitcher from "~client/components/patterns/TabSwitcher.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const ROUTE_TABS = [
  { id: "workout", label: "Workout", to: "/workout" },
  { id: "runs", label: "Läufe", to: "/runs" },
];

const LOCAL_TABS = [
  { id: "kraft", label: "Kraft" },
  { id: "lauf", label: "Lauf" },
];

describe("TabSwitcher", () => {
  it("renders a RouterLink per tab that carries a `to`, linking to their routes", () => {
    const wrapper = mountWithProviders(TabSwitcher, { props: { tabs: ROUTE_TABS, modelValue: "workout", navLabel: "Workout oder Läufe" } });
    const links = wrapper.findAll("a");

    expect(links).toHaveLength(2);
    expect(links[0]?.text()).toBe("Workout");
    expect(links[0]?.attributes("href")).toBe("/workout");
    expect(links[1]?.text()).toBe("Läufe");
    expect(links[1]?.attributes("href")).toBe("/runs");
  });

  it("marks the tab matching modelValue active, among RouterLink tabs", () => {
    const wrapper = mountWithProviders(TabSwitcher, { props: { tabs: ROUTE_TABS, modelValue: "runs", navLabel: "Workout oder Läufe" } });
    const [workoutPill, runsPill] = wrapper.findAll("a");

    expect(workoutPill?.classes()).not.toContain("active");
    expect(runsPill?.classes()).toContain("active");
  });

  it("carries an accessible nav label", () => {
    const wrapper = mountWithProviders(TabSwitcher, { props: { tabs: ROUTE_TABS, modelValue: "workout", navLabel: "Workout oder Läufe" } });
    expect(wrapper.find("nav").attributes("aria-label")).toBe("Workout oder Läufe");
  });

  it("renders a button per tab with no `to`, emitting update:modelValue on click", async () => {
    const wrapper = mountWithProviders(TabSwitcher, { props: { tabs: LOCAL_TABS, modelValue: "kraft", navLabel: "Kraft- oder Lauf-Ränge" } });
    const buttons = wrapper.findAll("button");

    expect(buttons).toHaveLength(2);
    expect(wrapper.findAll("a")).toHaveLength(0);
    expect(buttons[0]?.classes()).toContain("active");

    await buttons[1]!.trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["lauf"]]);
  });
});
