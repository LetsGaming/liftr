import { describe, expect, it, vi } from "vitest";
import BasePage from "~client/components/ui/BasePage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("BasePage", () => {
  it("renders the title", () => {
    const wrapper = mountWithProviders(BasePage, { props: { title: "Diagnose" } });

    expect(wrapper.text()).toContain("Diagnose");
  });

  it("omits the back button by default", () => {
    const wrapper = mountWithProviders(BasePage, { props: { title: "Diagnose" } });

    expect(wrapper.find(".base-page-back-btn").exists()).toBe(false);
  });

  it("renders a back button that calls router.back() when backButton is set", async () => {
    const wrapper = mountWithProviders(BasePage, { props: { title: "Diagnose", backButton: true } });
    const router = wrapper.vm.$router;
    const backSpy = vi.spyOn(router, "back").mockImplementation(() => {});

    const backBtn = wrapper.find(".base-page-back-btn");
    expect(backBtn.exists()).toBe(true);
    expect(backBtn.attributes("aria-label")).toBe("Zurück");

    await backBtn.trigger("click");
    expect(backSpy).toHaveBeenCalledOnce();
  });

  it("renders the default slot inside the content area", () => {
    const wrapper = mountWithProviders(BasePage, {
      props: { title: "Diagnose" },
      slots: { default: "<p class=\"body\">Body content</p>" },
    });

    expect(wrapper.find(".body").text()).toBe("Body content");
  });

  it("renders the header-actions slot", () => {
    const wrapper = mountWithProviders(BasePage, {
      props: { title: "Diagnose" },
      slots: { "header-actions": "<button class=\"action\">Aktion</button>" },
    });

    expect(wrapper.find(".action").exists()).toBe(true);
  });

  it("defaults to the plain page variant with no drawer class", () => {
    const wrapper = mountWithProviders(BasePage, { props: { title: "Diagnose" } });

    expect(wrapper.classes()).not.toContain("base-page-drawer");
  });

  it("applies the drawer variant's class", () => {
    const wrapper = mountWithProviders(BasePage, { props: { title: "Diagnose", variant: "drawer" } });

    expect(wrapper.classes()).toContain("base-page-drawer");
  });

  it("renders no subheader element when the slot is unused", () => {
    const wrapper = mountWithProviders(BasePage, { props: { title: "Diagnose" } });

    expect(wrapper.find(".base-page-subheader").exists()).toBe(false);
  });

  it("renders the subheader slot, pinned outside the scrolling content area", () => {
    const wrapper = mountWithProviders(BasePage, {
      props: { title: "Diagnose" },
      slots: { subheader: "<div class=\"tabs\">Tabs</div>", default: "<p class=\"body\">Body</p>" },
    });

    const subheader = wrapper.find(".base-page-subheader");
    expect(subheader.exists()).toBe(true);
    expect(subheader.find(".tabs").exists()).toBe(true);
    // A non-scrolling sibling of ion-content, not nested inside it — the whole point of the slot.
    expect(wrapper.find("ion-content .tabs").exists()).toBe(false);
    expect(wrapper.find("ion-content .body").exists()).toBe(true);
  });
});
