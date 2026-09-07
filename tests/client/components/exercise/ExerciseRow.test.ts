import { describe, expect, it } from "vitest";
import ExerciseRow from "~client/components/exercise/ExerciseRow.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("ExerciseRow", () => {
  it("renders the exercise name and defaults to the thumb visual", () => {
    const wrapper = mountWithProviders(ExerciseRow, {
      props: { slug: "bench-press", equipment: "barbell", name: "Bankdrücken" },
    });

    expect(wrapper.find(".ex-name").text()).toBe("Bankdrücken");
    expect(wrapper.find(".exercise-thumb").exists()).toBe(true);
    expect(wrapper.find("svg.equipment-icon").exists()).toBe(false);
  });

  it("renders the bare equipment icon instead of a thumb when visual is icon", () => {
    const wrapper = mountWithProviders(ExerciseRow, {
      props: { slug: "bench-press", equipment: "barbell", name: "Bankdrücken", visual: "icon" },
    });

    expect(wrapper.find(".exercise-thumb").exists()).toBe(false);
    expect(wrapper.find("svg.equipment-icon").exists()).toBe(true);
  });

  it("passes size through to whichever visual is rendered", () => {
    const wrapper = mountWithProviders(ExerciseRow, {
      props: { slug: "bench-press", equipment: "barbell", name: "Bankdrücken", visual: "icon", size: 28 },
    });

    expect(wrapper.find("svg.equipment-icon").attributes("width")).toBe("28");
  });

  it("renders the meta slot content below the name", () => {
    const wrapper = mountWithProviders(ExerciseRow, {
      props: { slug: "bench-press", equipment: "barbell", name: "Bankdrücken" },
      slots: { meta: "<span class='extra-meta'>3 Sätze</span>" },
    });

    expect(wrapper.find(".ex-row-meta .extra-meta").text()).toBe("3 Sätze");
  });

  it("renders the trailing slot content outside the meta column", () => {
    const wrapper = mountWithProviders(ExerciseRow, {
      props: { slug: "bench-press", equipment: "barbell", name: "Bankdrücken" },
      slots: { trailing: "<button class='remove'>x</button>" },
    });

    const trailing = wrapper.find(".exercise-row > .remove");
    expect(trailing.exists()).toBe(true);
  });
});
