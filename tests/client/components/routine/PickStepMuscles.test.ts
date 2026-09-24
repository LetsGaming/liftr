// Split out of a single PickStep.test.ts alongside PickStepManual.vue/PickStepMuscles.vue's own
// split from PickStep.vue — see PickStepManual.vue's doc comment. No store/composable to seed
// here (MuscleFigure/Chip render from static muscle-slug data).
import { describe, expect, it } from "vitest";
import PickStepMuscles from "~client/components/routine/PickStepMuscles.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("PickStepMuscles", () => {
  it("renders a chip per muscle group", () => {
    const wrapper = mountWithProviders(PickStepMuscles, { props: {} });

    expect(wrapper.find(".muscle-chip").exists()).toBe(true);
  });

  it("disables the suggest button until at least one muscle is picked", async () => {
    const wrapper = mountWithProviders(PickStepMuscles, { props: {} });

    const suggestBtn = wrapper.find(".muscle-suggest > button");
    expect(suggestBtn.attributes("disabled")).toBeDefined();

    await wrapper.find(".muscle-chip").trigger("click");

    expect(suggestBtn.attributes("disabled")).toBeUndefined();
    expect(suggestBtn.text()).toBe("Übungen vorschlagen (1 Muskelgruppen)");
  });

  it("toggling a chip twice deselects it again", async () => {
    const wrapper = mountWithProviders(PickStepMuscles, { props: {} });
    const chip = wrapper.find(".muscle-chip");

    await chip.trigger("click");
    expect(chip.classes()).toContain("active");

    await chip.trigger("click");
    expect(chip.classes()).not.toContain("active");
  });

  it("emits suggest with the picked muscle slugs", async () => {
    const wrapper = mountWithProviders(PickStepMuscles, { props: {} });

    const chips = wrapper.findAll(".muscle-chip");
    await chips[0]!.trigger("click");
    await chips[1]!.trigger("click");
    await wrapper.find(".muscle-suggest > button").trigger("click");

    const emitted = wrapper.emitted("suggest");
    expect(emitted).toHaveLength(1);
    expect(emitted![0]![0]).toHaveLength(2);
  });

  it("shows the busy label and disables suggest while suggesting", () => {
    const wrapper = mountWithProviders(PickStepMuscles, { props: { suggesting: true } });

    // suggesting=true alone still requires a picked muscle to matter for the click-guard, but the
    // label swap and disabled state are unconditional on `suggesting`.
    const suggestBtn = wrapper.find(".muscle-suggest > button");
    expect(suggestBtn.text()).toBe("Wird zusammengestellt…");
    expect(suggestBtn.attributes("disabled")).toBeDefined();
  });
});
