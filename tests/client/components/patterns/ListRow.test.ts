import { describe, expect, it } from "vitest";
import ListRow from "~client/components/patterns/ListRow.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("ListRow", () => {
  it("renders a div by default, non-interactive", () => {
    const wrapper = mountWithProviders(ListRow, { slots: { default: "Name" } });
    expect(wrapper.element.tagName).toBe("DIV");
    expect(wrapper.classes()).not.toContain("list-row-interactive");
  });

  it("renders each slot in its own region: leading, default (main), trailing", () => {
    const wrapper = mountWithProviders(ListRow, {
      slots: {
        leading: "<img class='thumb' />",
        default: "<b class='name'>Bankdrücken</b>",
        trailing: "<button class='remove'>x</button>",
      },
    });
    expect(wrapper.find(".list-row-leading .thumb").exists()).toBe(true);
    expect(wrapper.find(".list-row-main .name").exists()).toBe(true);
    expect(wrapper.find(".remove").exists()).toBe(true);
  });

  it("renders the trailing slot as a direct child of the root element", () => {
    const wrapper = mountWithProviders(ListRow, { slots: { trailing: "<button class='remove'>x</button>" } });
    expect(wrapper.find(":scope > .remove").exists()).toBe(true);
  });

  it("omits the leading wrapper entirely when no leading slot is given", () => {
    const wrapper = mountWithProviders(ListRow, { slots: { default: "Name" } });
    expect(wrapper.find(".list-row-leading").exists()).toBe(false);
  });

  it("defaults interactive to true for button and router-link, false otherwise", () => {
    expect(mountWithProviders(ListRow, { props: { as: "button" } }).classes()).toContain("list-row-interactive");
    expect(mountWithProviders(ListRow, { props: { as: "router-link", to: "/x" } }).classes()).toContain("list-row-interactive");
    expect(mountWithProviders(ListRow, { props: { as: "div" } }).classes()).not.toContain("list-row-interactive");
    expect(mountWithProviders(ListRow, { props: { as: "li" } }).classes()).not.toContain("list-row-interactive");
  });

  it("lets interactive be overridden explicitly either way", () => {
    expect(mountWithProviders(ListRow, { props: { as: "div", interactive: true } }).classes()).toContain("list-row-interactive");
    expect(mountWithProviders(ListRow, { props: { as: "button", interactive: false } }).classes()).not.toContain("list-row-interactive");
  });

  it("renders as the requested element, including a router-link with a resolved href", () => {
    expect(mountWithProviders(ListRow, { props: { as: "li" } }).element.tagName).toBe("LI");
    const link = mountWithProviders(ListRow, { props: { as: "router-link", to: "/foo" } });
    expect(link.element.tagName).toBe("A");
    expect(link.attributes("href")).toBe("/foo");
  });

  it("renders a chevron only when requested", () => {
    expect(mountWithProviders(ListRow, { props: { chevron: true } }).find(".list-row-chevron").exists()).toBe(true);
    expect(mountWithProviders(ListRow).find(".list-row-chevron").exists()).toBe(false);
  });

  it("applies the dense modifier class", () => {
    expect(mountWithProviders(ListRow, { props: { dense: true } }).classes()).toContain("list-row-dense");
  });

  it("forwards an arbitrary class to the root element", () => {
    const wrapper = mountWithProviders(ListRow, { attrs: { class: "pr-row" } });
    expect(wrapper.classes()).toContain("pr-row");
    expect(wrapper.classes()).toContain("list-row");
  });
});
