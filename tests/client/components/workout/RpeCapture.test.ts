// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import RpeCapture from "~client/components/workout/RpeCapture.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

/** SheetModal (this component's shell) is built on @ionic/vue's real <IonModal>, whose Stencil
 *  custom element never upgrades under jsdom — it renders no slotted content at all without it
 *  (confirmed: mounting SheetModal unstubbed produces an empty <ion-modal></ion-modal>). Stubbing
 *  just IonModal (not SheetModal itself, which still runs its own real header/body wiring and
 *  dismiss()/close plumbing) is the targeted fix tests/README.md's "stub that specific element"
 *  guidance describes — same stub tests/client/components/ui/SheetModal.test.ts uses on itself.
 *  RpeCapture calls `sheetRef.value?.dismiss()` on pick, which SheetModal.vue resolves down to
 *  `modalRef.value.$el?.dismiss()` — this stub attaches that method in `mounted()`. */
const IonModalStub = defineComponent({
  name: "IonModal",
  props: {
    isOpen: { type: Boolean, default: false },
    breakpoints: { type: Array, default: undefined },
    initialBreakpoint: { type: Number, default: undefined },
    backdropDismiss: { type: Boolean, default: undefined },
  },
  emits: ["did-dismiss"],
  mounted() {
    (this.$el as HTMLElement & { dismiss?: () => Promise<boolean> }).dismiss = () => {
      this.$emit("did-dismiss");
      return Promise.resolve(true);
    };
  },
  template: `<div class="ion-modal-stub"><slot name="header" /><slot /></div>`,
});

function mountCapture(currentRpe: number | null) {
  return mountWithProviders(RpeCapture, {
    props: { currentRpe },
    global: { stubs: { IonModal: IonModalStub } },
  });
}

beforeEach(() => {
  // requestAnimationFrame drives SheetModal's deferred `close` emit past did-dismiss (see its
  // 2026-09-05 header comment) — made synchronous so tests don't depend on jsdom's rAF timing.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RpeCapture", () => {
  it("renders exactly ten options, labeled 1 through 10", () => {
    const wrapper = mountCapture(null);

    const options = wrapper.findAll(".rpe-opt");
    expect(options).toHaveLength(10);
    expect(options.map((o) => o.text())).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  });

  it("marks no option active when currentRpe is null", () => {
    const wrapper = mountCapture(null);

    expect(wrapper.findAll(".rpe-opt.active")).toHaveLength(0);
  });

  it("marks exactly the matching option active for a given currentRpe", () => {
    const wrapper = mountCapture(7);

    const active = wrapper.findAll(".rpe-opt.active");
    expect(active).toHaveLength(1);
    expect(active[0]!.text()).toBe("7");
  });

  it("emits pick with the tapped number and closes the sheet", async () => {
    const wrapper = mountCapture(null);

    await wrapper.findAll(".rpe-opt")[4]!.trigger("click"); // "5"

    expect(wrapper.emitted("pick")).toEqual([[5]]);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("picking 10 (not just single digits) emits the correct numeric value", async () => {
    const wrapper = mountCapture(null);

    await wrapper.findAll(".rpe-opt")[9]!.trigger("click");

    expect(wrapper.emitted("pick")).toEqual([[10]]);
  });

  it("renders the fixed RPE title and hint copy", () => {
    const wrapper = mountCapture(null);

    expect(wrapper.text()).toContain("RPE");
    expect(wrapper.find(".rpe-hint").text()).toContain("Wie anstrengend war der Satz?");
  });
});
