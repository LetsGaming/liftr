// SheetModal.vue wraps @ionic/vue's real <IonModal>, which itself wraps a lazily-defined Stencil
// custom element (`ion-modal`) — loading that for real under jsdom is exactly what tests/README.md
// warns against ("if a component reads a property/method Ionic itself would set on one, stub that
// specific element via global.stubs instead of trying to load real @ionic/vue"). This stub mimics
// the one property SheetModal.vue actually reaches for: dismiss() on the modal's own $el (see
// that file's header comment on why dismiss() must go through the real element, never a plain
// Vue unmount) — our stub's dismiss() emits "did-dismiss" synchronously, standing in for Ionic's
// real (asynchronous) teardown finishing.
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import SheetModal from "~client/components/ui/SheetModal.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

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

function mountSheet(options: Parameters<typeof mountWithProviders>[1] = {}) {
  return mountWithProviders(SheetModal, {
    ...options,
    global: { stubs: { IonModal: IonModalStub }, ...options.global },
  });
}

beforeEach(() => {
  // requestAnimationFrame drives the deferred `close` emit (see SheetModal.vue's 2026-09-05
  // header comment) — made synchronous so tests don't depend on jsdom's real rAF timing.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SheetModal", () => {
  describe("no #header slot (title + close button shape)", () => {
    it("renders the title and default slot content", () => {
      const wrapper = mountSheet({ props: { title: "Übung" }, slots: { default: "<p>Body content</p>" } });

      expect(wrapper.find(".sheet-head b").text()).toBe("Übung");
      expect(wrapper.find(".sheet").classes()).not.toContain("has-custom-header");
      expect(wrapper.text()).toContain("Body content");
    });

    it("clicking the close button dismisses the modal and, after teardown, emits close", async () => {
      const wrapper = mountSheet({ props: { title: "Übung" } });

      await wrapper.find(".btn-close").trigger("click");
      await flushPromises();

      expect(wrapper.emitted("close")).toHaveLength(1);
    });
  });

  describe("#header slot provided (pinned header + scrolling body shape)", () => {
    it("renders the header slot pinned above a separate scrolling body, not the default title bar", () => {
      const wrapper = mountSheet({
        slots: { header: "<div class=\"my-header\">Step 1/3</div>", default: "<p>Step body</p>" },
      });

      expect(wrapper.find(".sheet").classes()).toContain("has-custom-header");
      expect(wrapper.find(".sheet-head").exists()).toBe(false);
      expect(wrapper.find(".my-header").exists()).toBe(true);
      expect(wrapper.find(".sheet-scroll").text()).toContain("Step body");
    });

    it("exposes dismiss() for a caller with no built-in close button of its own (e.g. OnboardingGuide)", async () => {
      const wrapper = mountSheet({ slots: { header: "<div>Header</div>" } });

      await (wrapper.vm as unknown as { dismiss: () => void }).dismiss();
      await flushPromises();

      expect(wrapper.emitted("close")).toHaveLength(1);
    });
  });

  describe("sheet vs. full-bleed shape", () => {
    it("defaults to the draggable sheet shape with breakpoints [0, 1]", () => {
      const wrapper = mountSheet();
      const modal = wrapper.findComponent(IonModalStub);

      expect(modal.props("breakpoints")).toEqual([0, 1]);
      expect(modal.props("initialBreakpoint")).toBe(1);
      expect(wrapper.find(".ion-modal-stub").classes()).not.toContain("full-modal");
    });

    it("sheet=false renders a static full-bleed modal with no breakpoints", () => {
      const wrapper = mountSheet({ props: { sheet: false } });
      const modal = wrapper.findComponent(IonModalStub);

      expect(modal.props("breakpoints")).toBeUndefined();
      expect(modal.props("initialBreakpoint")).toBeUndefined();
      expect(wrapper.find(".ion-modal-stub").classes()).toContain("full-modal");
    });

    it("backdropDismiss defaults to sheet's own value when unset", () => {
      const draggable = mountSheet({ props: { sheet: true } });
      expect(draggable.findComponent(IonModalStub).props("backdropDismiss")).toBe(true);

      const fullBleed = mountSheet({ props: { sheet: false } });
      expect(fullBleed.findComponent(IonModalStub).props("backdropDismiss")).toBe(false);
    });

    it("an explicit backdropDismiss overrides the sheet-derived default", () => {
      const wrapper = mountSheet({ props: { sheet: false, backdropDismiss: true } });
      expect(wrapper.findComponent(IonModalStub).props("backdropDismiss")).toBe(true);
    });
  });

  describe("desktopVariant", () => {
    it("defaults to the centered card shape", () => {
      const wrapper = mountSheet();
      expect(wrapper.find(".ion-modal-stub").classes()).toContain("card-modal");
      expect(wrapper.find(".ion-modal-stub").classes()).not.toContain("drawer-modal");
    });

    it("switches to the right-edge drawer shape", () => {
      const wrapper = mountSheet({ props: { desktopVariant: "drawer" } });
      expect(wrapper.find(".ion-modal-stub").classes()).toContain("drawer-modal");
      expect(wrapper.find(".ion-modal-stub").classes()).not.toContain("card-modal");
    });

    it("a full-bleed (sheet=false) modal gets neither card nor drawer styling", () => {
      const wrapper = mountSheet({ props: { sheet: false, desktopVariant: "card" } });
      expect(wrapper.find(".ion-modal-stub").classes()).not.toContain("card-modal");
      expect(wrapper.find(".ion-modal-stub").classes()).not.toContain("drawer-modal");
    });
  });
});
