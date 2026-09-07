// SyncIndicator.vue just reads useSyncStore()'s pendingCount/flushing reactively (no store
// mutations of its own) — real store, seeded directly via its state, same as any other
// prop/store-driven display component. syncStore.ts's Capacitor/idb imports are only touched
// inside actions this component never calls, so no mocking is needed at module scope (see
// tests/client/stores/syncStore.test.ts for the fuller mock set those action-level tests need).
import { describe, expect, it } from "vitest";
import SyncIndicator from "~client/components/ui/SyncIndicator.vue";
import { useSyncStore } from "~client/stores/syncStore";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("SyncIndicator", () => {
  it("shows the idle dot when nothing is queued and nothing is flushing", () => {
    const wrapper = mountWithProviders(SyncIndicator);

    expect(wrapper.attributes("data-sync-state")).toBe("idle");
    expect(wrapper.find(".sync-dot-idle").exists()).toBe(true);
    expect(wrapper.find(".sync-badge").exists()).toBe(false);
  });

  it("shows a count badge once items are queued but nothing is flushing yet", async () => {
    const wrapper = mountWithProviders(SyncIndicator);
    const sync = useSyncStore();

    sync.pendingCount = 3;
    await wrapper.vm.$nextTick();

    expect(wrapper.attributes("data-sync-state")).toBe("queued");
    expect(wrapper.find(".sync-badge").text()).toBe("3");
    expect(wrapper.find(".sync-dot-syncing").exists()).toBe(false);
  });

  it("shows the pulsing syncing dot while flushing, regardless of pendingCount", async () => {
    const wrapper = mountWithProviders(SyncIndicator);
    const sync = useSyncStore();

    sync.pendingCount = 5;
    sync.flushing = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.attributes("data-sync-state")).toBe("syncing");
    expect(wrapper.find(".sync-dot-syncing.shimmer").exists()).toBe(true);
    expect(wrapper.find(".sync-badge").exists()).toBe(false);
  });

  it("flushing takes priority over pendingCount === 0 (still shows syncing, not idle)", async () => {
    const wrapper = mountWithProviders(SyncIndicator);
    const sync = useSyncStore();

    sync.pendingCount = 0;
    sync.flushing = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.attributes("data-sync-state")).toBe("syncing");
  });

  it("returns to idle once flushing finishes and the queue is empty again", async () => {
    const wrapper = mountWithProviders(SyncIndicator);
    const sync = useSyncStore();

    sync.pendingCount = 2;
    sync.flushing = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.attributes("data-sync-state")).toBe("syncing");

    sync.flushing = false;
    sync.pendingCount = 0;
    await wrapper.vm.$nextTick();

    expect(wrapper.attributes("data-sync-state")).toBe("idle");
  });

  it("is aria-hidden — a purely decorative confidence cue, never announced", () => {
    const wrapper = mountWithProviders(SyncIndicator);
    expect(wrapper.attributes("aria-hidden")).toBe("true");
  });
});
