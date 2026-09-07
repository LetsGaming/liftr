import { describe, expect, it } from "vitest";
import ExerciseIcon from "~client/components/exercise/ExerciseIcon.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("ExerciseIcon", () => {
  it("renders an svg at the default 20px size with the standard 24x24 viewBox", () => {
    const wrapper = mountWithProviders(ExerciseIcon, { props: { equipment: "barbell" } });

    const svg = wrapper.find("svg.equipment-icon");
    expect(svg.exists()).toBe(true);
    expect(svg.attributes("width")).toBe("20");
    expect(svg.attributes("height")).toBe("20");
    expect(svg.attributes("viewBox")).toBe("0 0 24 24");
  });

  it("applies a custom size to both width and height", () => {
    const wrapper = mountWithProviders(ExerciseIcon, { props: { equipment: "dumbbell", size: 32 } });

    const svg = wrapper.find("svg.equipment-icon");
    expect(svg.attributes("width")).toBe("32");
    expect(svg.attributes("height")).toBe("32");
  });

  it("renders different path markup for different known equipment", () => {
    const barbell = mountWithProviders(ExerciseIcon, { props: { equipment: "barbell" } });
    const kettlebell = mountWithProviders(ExerciseIcon, { props: { equipment: "kettlebell" } });

    expect(barbell.find("svg").html()).not.toBe(kettlebell.find("svg").html());
  });

  it("falls back to the machine icon for an unrecognized equipment value", () => {
    const unknown = mountWithProviders(ExerciseIcon, { props: { equipment: "not-a-real-equipment" } });
    const machine = mountWithProviders(ExerciseIcon, { props: { equipment: "machine" } });

    expect(unknown.find("svg").html()).toBe(machine.find("svg").html());
  });

  it("re-renders the path when the equipment prop changes", async () => {
    const wrapper = mountWithProviders(ExerciseIcon, { props: { equipment: "barbell" } });
    const barbellHtml = wrapper.find("svg").html();

    await wrapper.setProps({ equipment: "kettlebell" });

    expect(wrapper.find("svg").html()).not.toBe(barbellHtml);
  });
});
