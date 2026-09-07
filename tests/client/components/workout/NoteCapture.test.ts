// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import NoteCapture from "~client/components/workout/NoteCapture.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

/** See RpeCapture.test.ts for why only IonModal (not SheetModal itself) is stubbed — same
 *  stub as tests/client/components/ui/SheetModal.test.ts uses on itself. NoteCapture calls
 *  `sheetRef.value?.dismiss()` on save, which needs this stub's `.dismiss()` on `$el`. */
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

function mountCapture(title: string, modelValue: string | null) {
  return mountWithProviders(NoteCapture, {
    props: { title, modelValue },
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

describe("NoteCapture", () => {
  it("seeds the textarea from modelValue", () => {
    const wrapper = mountCapture("Notiz zum Satz", "felt heavy");

    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("felt heavy");
  });

  it("seeds an empty textarea when modelValue is null", () => {
    const wrapper = mountCapture("Notiz zum Satz", null);

    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("");
  });

  it("renders the given title in the sheet header", () => {
    const wrapper = mountCapture("Workout-Notiz", null);

    expect(wrapper.find(".sheet-head b").text()).toBe("Workout-Notiz");
  });

  it("emits save with the trimmed textarea content and closes the sheet", async () => {
    const wrapper = mountCapture("Notiz", null);

    await wrapper.find("textarea").setValue("  felt strong today  ");
    await wrapper.find(".note-save").trigger("click");

    expect(wrapper.emitted("save")).toEqual([["felt strong today"]]);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("emits save with null when the trimmed content is empty, rather than an empty string", async () => {
    const wrapper = mountCapture("Notiz", null);

    await wrapper.find("textarea").setValue("    ");
    await wrapper.find(".note-save").trigger("click");

    expect(wrapper.emitted("save")).toEqual([[null]]);
  });

  it("editing an existing note and saving emits the updated, trimmed value", async () => {
    const wrapper = mountCapture("Notiz", "old note");

    await wrapper.find("textarea").setValue("new note");
    await wrapper.find(".note-save").trigger("click");

    expect(wrapper.emitted("save")).toEqual([["new note"]]);
  });

  it("closing via the sheet's own close button emits close without emitting save", async () => {
    const wrapper = mountCapture("Notiz", null);

    await wrapper.find(".btn-close").trigger("click");

    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("save")).toBeUndefined();
  });
});
