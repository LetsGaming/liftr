// ToastHost.vue renders whatever useToast.ts's shared module-level queue currently holds. That
// queue is a singleton (not a Pinia store — see useToast.ts's own header comment), so state
// leaks across tests unless each test resets modules and re-imports both useToast and ToastHost
// fresh, same discipline tests/client/composables/useToast.test.ts already uses for the
// composable alone. Real composable throughout (not mocked) — it's simple and already covered
// at the composable level; this file only checks that the host renders/removes toasts as that
// queue changes, including driving the auto-dismiss timing from the component side.
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountWithProviders } from "../../helpers/mountWithProviders";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastHost", () => {
  it("renders no toasts when the queue starts empty", async () => {
    const { default: ToastHost } = await import("~client/components/ui/ToastHost.vue");
    const wrapper = mountWithProviders(ToastHost);

    expect(wrapper.findAll(".toast")).toHaveLength(0);
  });

  it("renders a toast pushed onto the shared queue after the host is mounted", async () => {
    const { default: ToastHost } = await import("~client/components/ui/ToastHost.vue");
    const { useToast } = await import("~client/composables/useToast");
    const wrapper = mountWithProviders(ToastHost);

    useToast().toast("Gespeichert");
    await wrapper.vm.$nextTick();

    const toasts = wrapper.findAll(".toast");
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.text()).toBe("Gespeichert");
  });

  it("renders multiple queued toasts in push order", async () => {
    const { default: ToastHost } = await import("~client/components/ui/ToastHost.vue");
    const { useToast } = await import("~client/composables/useToast");
    const wrapper = mountWithProviders(ToastHost);
    const { toast } = useToast();

    toast("Erstes");
    toast("Zweites");
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll(".toast").map((t) => t.text())).toEqual(["Erstes", "Zweites"]);
  });

  it("removes a toast from the DOM once useToast auto-dismisses it after 2500ms", async () => {
    const { default: ToastHost } = await import("~client/components/ui/ToastHost.vue");
    const { useToast } = await import("~client/composables/useToast");
    const wrapper = mountWithProviders(ToastHost);

    useToast().toast("bye soon");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".toast")).toHaveLength(1);

    vi.advanceTimersByTime(2500);
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll(".toast")).toHaveLength(0);
  });

  it("dismisses each toast independently, leaving an earlier-still-live toast in place", async () => {
    const { default: ToastHost } = await import("~client/components/ui/ToastHost.vue");
    const { useToast } = await import("~client/composables/useToast");
    const wrapper = mountWithProviders(ToastHost);
    const { toast } = useToast();

    toast("first"); // scheduled to leave at t=2500
    vi.advanceTimersByTime(1000);
    toast("second"); // scheduled to leave at t=3500
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".toast").map((t) => t.text())).toEqual(["first", "second"]);

    vi.advanceTimersByTime(1500); // t=2500: only "first" leaves
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".toast").map((t) => t.text())).toEqual(["second"]);

    vi.advanceTimersByTime(1000); // t=3500: "second" leaves too
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".toast")).toHaveLength(0);
  });

  it("marks the host as a polite live region so toasts are announced without stealing focus", async () => {
    const { default: ToastHost } = await import("~client/components/ui/ToastHost.vue");
    const wrapper = mountWithProviders(ToastHost);

    expect(wrapper.attributes("aria-live")).toBe("polite");
  });
});
