import { describe, expect, it } from "vitest";
import WorkoutRunsSwitcher from "~client/components/ui/WorkoutRunsSwitcher.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("WorkoutRunsSwitcher", () => {
  it("renders one pill each for Workout and Läufe, linking to their routes", () => {
    const wrapper = mountWithProviders(WorkoutRunsSwitcher, { props: { active: "workout" } });
    const links = wrapper.findAll("a");

    expect(links).toHaveLength(2);
    expect(links[0]?.text()).toBe("Workout");
    expect(links[0]?.attributes("href")).toBe("/workout");
    expect(links[1]?.text()).toBe("Läufe");
    expect(links[1]?.attributes("href")).toBe("/runs");
  });

  it("marks the Workout pill active when active=\"workout\"", () => {
    const wrapper = mountWithProviders(WorkoutRunsSwitcher, { props: { active: "workout" } });
    const [workoutPill, runsPill] = wrapper.findAll("a");

    expect(workoutPill?.classes()).toContain("wr-active");
    expect(runsPill?.classes()).not.toContain("wr-active");
  });

  it("marks the Läufe pill active when active=\"runs\"", () => {
    const wrapper = mountWithProviders(WorkoutRunsSwitcher, { props: { active: "runs" } });
    const [workoutPill, runsPill] = wrapper.findAll("a");

    expect(workoutPill?.classes()).not.toContain("wr-active");
    expect(runsPill?.classes()).toContain("wr-active");
  });

  it("carries an accessible nav label", () => {
    const wrapper = mountWithProviders(WorkoutRunsSwitcher, { props: { active: "workout" } });
    expect(wrapper.find("nav").attributes("aria-label")).toBe("Workout oder Läufe");
  });
});
