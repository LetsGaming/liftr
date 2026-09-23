import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const { isNativeMock } = vi.hoisted(() => ({ isNativeMock: vi.fn().mockReturnValue(false) }));
// isAndroid is exported alongside isNative because useServerConnection.ts now imports
// useAppUpdate.ts (checkVersionMismatch reuses its currentVersion resolution), which reads
// isAndroid() at module scope.
vi.mock("~client/lib/platform", () => ({ isNative: isNativeMock, isAndroid: () => false }));

import ServerGate from "~client/components/ui/ServerGate.vue";

function installFakeLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
}

function fakeResponse(status: number, body?: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  installFakeLocalStorage();
  isNativeMock.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ServerGate", () => {
  it("renders the slot immediately on web, never showing the picker", () => {
    const wrapper = mountWithProviders(ServerGate, { slots: { default: "<div class='protected'>secret</div>" } });

    expect(wrapper.find(".protected").exists()).toBe(true);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("shows the picker on native with no server saved yet", () => {
    isNativeMock.mockReturnValue(true);

    const wrapper = mountWithProviders(ServerGate, { slots: { default: "<div class='protected'>secret</div>" } });

    expect(wrapper.find(".gate").exists()).toBe(true);
    expect(wrapper.find(".protected").exists()).toBe(false);
  });

  it("renders the slot immediately on native when a server URL was already saved — no re-verification on every launch", () => {
    isNativeMock.mockReturnValue(true);
    localStorage.setItem("liftr.serverUrl", "https://liftr.example.com");

    const wrapper = mountWithProviders(ServerGate, { slots: { default: "<div class='protected'>secret</div>" } });

    expect(wrapper.find(".protected").exists()).toBe(true);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("connecting to a verified server saves it and reveals the slot", async () => {
    isNativeMock.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr" })));

    const wrapper = mountWithProviders(ServerGate, { slots: { default: "<div class='protected'>secret</div>" } });

    await wrapper.find("input[aria-label='Server-Adresse']").setValue("liftr.example.com");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(localStorage.getItem("liftr.serverUrl")).toBe("https://liftr.example.com");
    expect(wrapper.find(".protected").exists()).toBe(true);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("shows an error and stays gated when the address doesn't answer as a Liftr instance", async () => {
    isNativeMock.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true })));

    const wrapper = mountWithProviders(ServerGate, { slots: { default: "<div class='protected'>secret</div>" } });

    await wrapper.find("input[aria-label='Server-Adresse']").setValue("not-liftr.example.com");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("keine Liftr-Instanz");
    expect(wrapper.find(".gate").exists()).toBe(true);
    expect(wrapper.find(".protected").exists()).toBe(false);
  });

  it("submits on Enter in the address field", async () => {
    isNativeMock.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr" })));

    const wrapper = mountWithProviders(ServerGate, { slots: { default: "<div class='protected'>secret</div>" } });

    const input = wrapper.find("input[aria-label='Server-Adresse']");
    await input.setValue("liftr.example.com");
    await input.trigger("keyup.enter");
    await flushPromises();

    expect(wrapper.find(".protected").exists()).toBe(true);
  });
});
