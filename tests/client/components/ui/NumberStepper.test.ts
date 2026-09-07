import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NumberStepper from "~client/components/ui/NumberStepper.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("NumberStepper", () => {
  describe("sm size (default)", () => {
    it("renders the current value and no editable big number", () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 8 } });

      expect(wrapper.text()).toContain("8");
      expect(wrapper.find(".num-edit").exists()).toBe(false);
    });

    it("emits adjust:1 on a plain click of the + button", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 8 } });

      const buttons = wrapper.findAll("button");
      const plus = buttons.find((b) => b.attributes("aria-label")?.startsWith("Mehr"))!;
      await plus.trigger("click");

      expect(wrapper.emitted("adjust")).toEqual([[1]]);
    });

    it("emits adjust:-1 on a plain click of the − button", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 8 } });

      const buttons = wrapper.findAll("button");
      const minus = buttons.find((b) => b.attributes("aria-label")?.startsWith("Weniger"))!;
      await minus.trigger("click");

      expect(wrapper.emitted("adjust")).toEqual([[-1]]);
    });

    it("appends the unit next to the value when provided", () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 20, unit: "kg" } });
      expect(wrapper.find(".ctrls span").text()).toBe("20kg");
    });

    it("includes the label in the button aria-labels when provided", () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 3, label: "Wochen" } });
      const buttons = wrapper.findAll("button");
      expect(buttons.some((b) => b.attributes("aria-label") === "Mehr Wochen")).toBe(true);
      expect(buttons.some((b) => b.attributes("aria-label") === "Weniger Wochen")).toBe(true);
    });
  });

  describe("lg size", () => {
    it("renders the label eyebrow and the value as an editable button", () => {
      const wrapper = mountWithProviders(NumberStepper, {
        props: { modelValue: 100, size: "lg", label: "Gewicht", unit: "kg" },
      });

      expect(wrapper.text()).toContain("Gewicht");
      const editBtn = wrapper.find(".num-edit");
      expect(editBtn.exists()).toBe(true);
      expect(editBtn.text()).toBe("100kg");
      expect(editBtn.attributes("aria-label")).toBe("Gewicht bearbeiten, aktuell 100 kg");
    });

    it("applies the emphasize class when the emphasize prop is true", () => {
      const wrapper = mountWithProviders(NumberStepper, {
        props: { modelValue: 0, size: "lg", emphasize: true },
      });
      expect(wrapper.find(".num-edit").classes()).toContain("emphasize");
    });

    it("emits adjust:1/-1 from the lg ctrls buttons too", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 5, size: "lg" } });

      const buttons = wrapper.findAll(".ctrls button");
      await buttons[1]!.trigger("click"); // + is second
      await buttons[0]!.trigger("click"); // − is first

      expect(wrapper.emitted("adjust")).toEqual([[1], [-1]]);
    });

    it("opens a direct-entry numeric input when the big number is clicked", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 100, size: "lg" } });

      await wrapper.find(".num-edit").trigger("click");

      const input = wrapper.find("input.num-input");
      expect(input.exists()).toBe(true);
      expect((input.element as HTMLInputElement).value).toBe("100");
    });

    it("emits set with the parsed numeric value on blur after editing", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 100, size: "lg" } });
      await wrapper.find(".num-edit").trigger("click");

      const input = wrapper.find("input.num-input");
      await input.setValue("102.5");
      await input.trigger("blur");

      expect(wrapper.emitted("set")).toEqual([[102.5]]);
      // editing closes again, back to the button
      expect(wrapper.find(".num-edit").exists()).toBe(true);
    });

    it("commits on Enter as well as blur", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 50, size: "lg" } });
      await wrapper.find(".num-edit").trigger("click");

      const input = wrapper.find("input.num-input");
      await input.setValue("60");
      await input.trigger("keydown.enter");

      expect(wrapper.emitted("set")).toEqual([[60]]);
    });

    it("treats a value the browser's own number-input sanitizes to empty as 0, not as a no-op", async () => {
      // jsdom (like real browsers) already refuses to hold non-numeric text in a
      // type="number" input's .value — typing "abc" leaves the element's value at "" rather
      // than "abc". Number("") is 0, which passes the component's Number.isFinite guard, so
      // this still commits — the guard only ever rejects truly non-finite results (Infinity/
      // NaN), not merely-empty input.
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 50, size: "lg" } });
      await wrapper.find(".num-edit").trigger("click");

      const input = wrapper.find("input.num-input");
      await input.setValue("abc");
      expect((input.element as HTMLInputElement).value).toBe("");
      await input.trigger("blur");

      expect(wrapper.emitted("set")).toEqual([[0]]);
    });

    it("cancels editing on Escape without emitting set", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 50, size: "lg" } });
      await wrapper.find(".num-edit").trigger("click");

      const input = wrapper.find("input.num-input");
      await input.setValue("999");
      await input.trigger("keydown.escape");

      expect(wrapper.emitted("set")).toBeUndefined();
      expect(wrapper.find(".num-edit").exists()).toBe(true);
    });

    it("renders slot content only relevant to lg usage (SetEntry's plate calculator reveal)", () => {
      const wrapper = mountWithProviders(NumberStepper, {
        props: { modelValue: 50, size: "lg" },
        slots: { default: "<div class='plates'>20+10</div>" },
      });
      expect(wrapper.find(".plates").exists()).toBe(true);
    });
  });

  describe("long-press repeat", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not repeat before the hold delay elapses", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 8 } });
      const plus = wrapper.findAll("button").find((b) => b.attributes("aria-label")?.startsWith("Mehr"))!;

      await plus.trigger("pointerdown");
      await vi.advanceTimersByTimeAsync(399);

      expect(wrapper.emitted("adjust")).toBeUndefined();
    });

    it("starts repeating adjust after the hold delay while pointer stays down", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 8 } });
      const plus = wrapper.findAll("button").find((b) => b.attributes("aria-label")?.startsWith("Mehr"))!;

      await plus.trigger("pointerdown");
      await vi.advanceTimersByTimeAsync(400); // hold delay elapses, starts the 150ms repeat interval
      await vi.advanceTimersByTimeAsync(150); // first repeat tick
      await vi.advanceTimersByTimeAsync(150); // second repeat tick

      const adjustEvents = wrapper.emitted("adjust") ?? [];
      expect(adjustEvents.length).toBeGreaterThanOrEqual(2);
      expect(adjustEvents.every((call) => call[0] === 1)).toBe(true);
    });

    it("stops repeating once the pointer is released", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 8 } });
      const plus = wrapper.findAll("button").find((b) => b.attributes("aria-label")?.startsWith("Mehr"))!;

      await plus.trigger("pointerdown");
      await vi.advanceTimersByTimeAsync(400);
      await plus.trigger("pointerup");
      const countAtRelease = (wrapper.emitted("adjust") ?? []).length;

      await vi.advanceTimersByTimeAsync(1000);

      expect((wrapper.emitted("adjust") ?? []).length).toBe(countAtRelease);
    });

    it("suppresses the trailing click's own emit after a completed hold (no double-fire)", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 8 } });
      const plus = wrapper.findAll("button").find((b) => b.attributes("aria-label")?.startsWith("Mehr"))!;

      await plus.trigger("pointerdown");
      await vi.advanceTimersByTimeAsync(400); // hold fires, holdFired flips true
      const countAfterHold = (wrapper.emitted("adjust") ?? []).length;
      await plus.trigger("pointerup");
      await plus.trigger("click"); // browser's synthetic click-after-pointerup

      expect((wrapper.emitted("adjust") ?? []).length).toBe(countAfterHold);
    });

    it("a short tap (release before hold delay) still emits a single adjust via click", async () => {
      const wrapper = mountWithProviders(NumberStepper, { props: { modelValue: 8 } });
      const plus = wrapper.findAll("button").find((b) => b.attributes("aria-label")?.startsWith("Mehr"))!;

      await plus.trigger("pointerdown");
      await vi.advanceTimersByTimeAsync(100); // well under the 400ms hold delay
      await plus.trigger("pointerup");
      await plus.trigger("click");

      expect(wrapper.emitted("adjust")).toEqual([[1]]);
    });
  });
});
