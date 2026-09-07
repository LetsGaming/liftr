// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { SET_KIND_LABEL } from "@liftr/shared";
import SetKindPicker from "~client/components/workout/SetKindPicker.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

/** See RpeCapture.test.ts for why only IonModal (not SheetModal itself) is stubbed — same
 *  stub as tests/client/components/ui/SheetModal.test.ts uses on itself. Even though
 *  SetKindPicker never calls dismiss() itself, SheetModal's own "X" close button does (its
 *  internal dismiss() -> modalRef.value.$el?.dismiss()), so this still needs the fuller
 *  dismiss()-emitting stub, not the bare-slot version. */
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

function mountPicker() {
  return mountWithProviders(SetKindPicker, {
    props: { workoutExerciseId: "we-1", setIndex: 0 },
    global: { stubs: { IonModal: IonModalStub } },
  });
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SetKindPicker", () => {
  it("renders one row per set kind, labeled from the shared SET_KIND_LABEL, plus a remove row", () => {
    const wrapper = mountPicker();

    const rows = wrapper.findAll(".kind-row");
    expect(rows).toHaveLength(5); // warmup, normal, failure, dropset + remove

    (["warmup", "normal", "failure", "dropset"] as const).forEach((kind, i) => {
      expect(rows[i]!.text()).toContain(SET_KIND_LABEL[kind]);
      expect(rows[i]!.find(".kind-letter").text()).toBe(SET_KIND_LABEL[kind][0]);
      expect(rows[i]!.find(".kind-letter").classes()).toContain(`k-${kind}`);
    });

    expect(rows[4]!.text()).toContain("Satz entfernen");
    expect(rows[4]!.classes()).toContain("danger");
  });

  it("emits pick with the tapped kind", async () => {
    const wrapper = mountPicker();

    const rows = wrapper.findAll(".kind-row");
    await rows[2]!.trigger("click"); // failure

    expect(wrapper.emitted("pick")).toEqual([["failure"]]);
    expect(wrapper.emitted("remove")).toBeUndefined();
  });

  it("emits pick with a different kind when a different row is tapped", async () => {
    const wrapper = mountPicker();

    await wrapper.findAll(".kind-row")[0]!.trigger("click"); // warmup
    expect(wrapper.emitted("pick")).toEqual([["warmup"]]);
  });

  it("emits remove when the remove row is tapped, not pick", async () => {
    const wrapper = mountPicker();

    await wrapper.findAll(".kind-row")[4]!.trigger("click");

    expect(wrapper.emitted("remove")).toHaveLength(1);
    expect(wrapper.emitted("pick")).toBeUndefined();
  });

  it("forwards the sheet's close event when its own close button is tapped", async () => {
    const wrapper = mountPicker();

    await wrapper.find(".btn-close").trigger("click");

    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("renders the fixed sheet title", () => {
    const wrapper = mountPicker();

    expect(wrapper.find(".sheet-head b").text()).toBe("Satzart auswählen");
  });
});
