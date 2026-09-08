// @vitest-environment jsdom
//
// RestTimer counts down on a plain setInterval — vi.useFakeTimers() drives that deterministically.
// Capacitor.isNativePlatform() genuinely returns false under jsdom (no native runtime present,
// same as production running in a browser — see @capacitor/core's own getPlatform(), which falls
// back to 'web'), so the LocalNotifications branch is naturally never taken and needs no mocking;
// only the browser Notification API (which jsdom doesn't implement) is stubbed, as a plain global.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RestTimer from "~client/components/workout/RestTimer.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

let notificationCtor: ReturnType<typeof vi.fn>;

function stubNotification(permission: "granted" | "denied" | "default") {
  notificationCtor = vi.fn();
  class FakeNotification {
    static permission = permission;
    constructor(title: string, options?: NotificationOptions) {
      notificationCtor(title, options);
    }
  }
  vi.stubGlobal("Notification", FakeNotification);
}

beforeEach(() => {
  vi.useFakeTimers();
  stubNotification("denied");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RestTimer", () => {
  it("shows the idle display (mm:ss of the configured seconds) before any trigger fires", () => {
    const wrapper = mountWithProviders(RestTimer, { props: { trigger: 0, seconds: 90, restKind: "between-sets" } });

    expect(wrapper.find(".ring i").text()).toBe("1:30");
    expect(wrapper.find(".meta span").text()).toBe("startet nach dem Satz");
  });

  it("defaults to 90 seconds when seconds is omitted", () => {
    const wrapper = mountWithProviders(RestTimer, { props: { trigger: 0, restKind: "between-sets" } });

    expect(wrapper.find(".ring i").text()).toBe("1:30");
  });

  it("starts counting down when trigger increases past 0", async () => {
    const wrapper = mountWithProviders(RestTimer, { props: { trigger: 0, seconds: 10, restKind: "between-sets" } });

    await wrapper.setProps({ trigger: 1 });
    expect(wrapper.find(".ring i").text()).toBe("0:10");
    expect(wrapper.find(".meta span").text()).toBe("läuft…");

    await vi.advanceTimersByTimeAsync(3000);
    expect(wrapper.find(".ring i").text()).toBe("0:07");
  });

  it("does not start (or restart) when trigger is set to 0 or a non-positive value", async () => {
    const wrapper = mountWithProviders(RestTimer, { props: { trigger: 0, seconds: 10, restKind: "between-sets" } });

    await wrapper.setProps({ trigger: -1 });

    expect(wrapper.find(".meta span").text()).toBe("startet nach dem Satz");
  });

  it("reaches zero, stops, marks justFinished (ring-done pulse), and fires a browser notification when permitted", async () => {
    stubNotification("granted");
    const wrapper = mountWithProviders(RestTimer, { props: { trigger: 0, seconds: 3, restKind: "between-sets" } });

    await wrapper.setProps({ trigger: 1 });
    await vi.advanceTimersByTimeAsync(3000);

    // running flipped back to false once it stops, so the readout reverts to the idle
    // "configured seconds" display, not the just-reached 0.
    expect(wrapper.find(".ring i").text()).toBe("0:03");
    expect(wrapper.find(".meta span").text()).toBe("startet nach dem Satz");
    expect(wrapper.find(".ring").classes()).toContain("ring-done");
    expect(notificationCtor).toHaveBeenCalledWith("Pause vorbei", { body: "Zeit für den nächsten Satz." });
  });

  it("does not fire a browser notification when permission was never granted", async () => {
    stubNotification("denied");
    const wrapper = mountWithProviders(RestTimer, { props: { trigger: 0, seconds: 3, restKind: "between-sets" } });

    await wrapper.setProps({ trigger: 1 });
    await vi.advanceTimersByTimeAsync(3000);

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("clicking the skip button stops the countdown early", async () => {
    const wrapper = mountWithProviders(RestTimer, { props: { trigger: 0, seconds: 30, restKind: "between-sets" } });

    await wrapper.setProps({ trigger: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(wrapper.find(".meta span").text()).toBe("läuft…");

    await wrapper.find(".skip-btn").trigger("click");

    expect(wrapper.find(".meta span").text()).toBe("startet nach dem Satz");
    // Notification only fires from the interval's own zero-crossing, not from skip()'s stop().
    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("re-reads the seconds prop fresh on every trigger, instead of caching the first value", async () => {
    const wrapper = mountWithProviders(RestTimer, { props: { trigger: 0, seconds: 60, restKind: "between-sets" } });

    await wrapper.setProps({ trigger: 1 });
    expect(wrapper.find(".ring i").text()).toBe("1:00");

    // Different exercise's configured rest duration takes effect on the *next* trigger.
    await wrapper.setProps({ seconds: 20, trigger: 2 });
    expect(wrapper.find(".ring i").text()).toBe("0:20");
  });

  it("a fresh trigger while already running restarts the countdown from the top", async () => {
    const wrapper = mountWithProviders(RestTimer, { props: { trigger: 0, seconds: 10, restKind: "between-sets" } });

    await wrapper.setProps({ trigger: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(wrapper.find(".ring i").text()).toBe("0:05");

    await wrapper.setProps({ trigger: 2 }); // e.g. another set logged before this one finished
    expect(wrapper.find(".ring i").text()).toBe("0:10");
  });

  describe("restKind: 'superset-continue'", () => {
    it("renders the compact acknowledged state instead of the ring/countdown/skip", async () => {
      const wrapper = mountWithProviders(RestTimer, {
        props: { trigger: 0, seconds: 90, restKind: "superset-continue" },
      });

      await wrapper.setProps({ trigger: 1 });

      expect(wrapper.find(".rest-timer-continue").exists()).toBe(true);
      expect(wrapper.find(".ring").exists()).toBe(false);
      expect(wrapper.find(".skip-btn").exists()).toBe(false);
      expect(wrapper.text()).toContain("Weiter im Superset");
      expect(wrapper.text()).toContain("keine Pause");
    });

    it("stops any in-flight countdown instead of starting a new one", async () => {
      const wrapper = mountWithProviders(RestTimer, { props: { trigger: 0, seconds: 10, restKind: "between-sets" } });
      await wrapper.setProps({ trigger: 1 });
      await vi.advanceTimersByTimeAsync(3000);
      expect(wrapper.find(".meta span").text()).toBe("läuft…");

      // Next set was mid-superset: no rest to count down.
      await wrapper.setProps({ trigger: 2, restKind: "superset-continue" });

      expect(wrapper.find(".rest-timer-continue").exists()).toBe(true);
      expect(wrapper.find(".ring").exists()).toBe(false);
    });
  });
});
