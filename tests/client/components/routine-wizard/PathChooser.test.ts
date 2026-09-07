// PathChooser.vue is pure presentation — two cards, each emitting "choose" with its own mode.
// No composables/stores to mock.
import { describe, expect, it } from "vitest";
import PathChooser from "~client/components/routine-wizard/PathChooser.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("PathChooser", () => {
  it("renders both path cards", () => {
    const wrapper = mountWithProviders(PathChooser);

    expect(wrapper.text()).toContain("Selbst zusammenstellen");
    expect(wrapper.text()).toContain("Nach Muskelgruppe vorschlagen lassen");
  });

  it("emits choose('manual') when the manual card is tapped", async () => {
    const wrapper = mountWithProviders(PathChooser);

    await wrapper.findAll(".path-card")[0]!.trigger("click");

    expect(wrapper.emitted("choose")).toEqual([["manual"]]);
  });

  it("emits choose('muscles') when the muscle-guided card is tapped", async () => {
    const wrapper = mountWithProviders(PathChooser);

    await wrapper.findAll(".path-card")[1]!.trigger("click");

    expect(wrapper.emitted("choose")).toEqual([["muscles"]]);
  });
});
