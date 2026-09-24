import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// AuthGate imports { ApiError, api, setToken } from "../../lib/api" (relative from its own
// file), which resolves to the same absolute packages/client/src/lib/api.ts that the ~client
// alias points at — so mocking "~client/lib/api" here does apply to it (tests/README.md).
// ApiError itself needs to stay the *real* class (AuthGate does `err instanceof ApiError`), so
// only api.get/api.post and setToken are overridden via importOriginal instead of replacing the
// module wholesale.
const { mockGet, mockPost, mockSetToken } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockSetToken: vi.fn(),
}));
vi.mock("~client/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~client/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, get: mockGet, post: mockPost },
    setToken: mockSetToken,
  };
});

import { ApiError } from "~client/lib/api";
import AuthGate from "~client/components/shell/AuthGate.vue";

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockSetToken.mockReset();
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthGate", () => {
  it("renders the slot immediately when status says setup is done and the session is valid", async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      if (path === "/api/auth/me") return Promise.resolve({ id: "u1", username: "owner", name: "Owner", role: "owner" });
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    expect(wrapper.find(".protected").exists()).toBe(true);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("renders the slot content (lets the app through) when the initial check fails offline, not with a 401", async () => {
    mockGet.mockRejectedValue(new TypeError("Failed to fetch"));

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    expect(wrapper.find(".protected").exists()).toBe(true);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("shows the setup form when needsSetup is true", async () => {
    mockGet.mockResolvedValue({ needsSetup: true });

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    expect(wrapper.find(".gate").exists()).toBe(true);
    expect(wrapper.find("input[type='password']").exists()).toBe(true);
    expect(wrapper.find("input[aria-label='Benutzername']").exists()).toBe(false);
    expect(wrapper.find(".protected").exists()).toBe(false);
  });

  it("shows the join form when the URL has an invite query param", async () => {
    window.history.pushState({}, "", "/?invite=ABCD2345");
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      return Promise.reject(new ApiError("unauthorized", 401));
    });

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    expect(wrapper.find("input[aria-label='Einladungscode']").exists()).toBe(true);
    expect(wrapper.find("input[aria-label='Benutzername']").exists()).toBe(true);
  });

  it("shows the login form by default when a session is missing/invalid", async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      return Promise.reject(new ApiError("unauthorized", 401));
    });

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    expect(wrapper.find("input[aria-label='Benutzername']").exists()).toBe(true);
    expect(wrapper.find("input[aria-label='Einladungscode']").exists()).toBe(false);
    expect(wrapper.find(".protected").exists()).toBe(false);
  });

  it("shows a forgot-password hint pointing at the server operator on the login form only", async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      return Promise.reject(new ApiError("unauthorized", 401));
    });

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    expect(wrapper.text()).toContain("Passwort vergessen?");
  });

  it("does not show the forgot-password hint on the setup form", async () => {
    mockGet.mockResolvedValue({ needsSetup: true });

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Passwort vergessen?");
  });

  it("submitting setup stores the returned token and reveals the slot", async () => {
    mockGet.mockResolvedValue({ needsSetup: true });
    mockPost.mockResolvedValue({ token: "owner-token" });

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    await wrapper.find("input[type='password']").setValue("ownerpass1");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(mockPost).toHaveBeenCalledWith("/api/auth/setup", { password: "ownerpass1" });
    expect(mockSetToken).toHaveBeenCalledWith("owner-token");
    expect(wrapper.find(".protected").exists()).toBe(true);
    // App.vue re-runs its App-mount store loads (streak/xp/settings/overallRank) off this emit —
    // without it, a fresh install's first-ever session stayed permanently stale-empty (the
    // onboarding wizard never showing, the top HUD never populating) until a full app restart.
    // See App.vue's loadAppState()/showOnboarding watcher comments for the full bug.
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("submitting login stores the token and reveals the slot", async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      return Promise.reject(new ApiError("unauthorized", 401));
    });
    mockPost.mockResolvedValue({ token: "new-token" });

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    await wrapper.find("input[aria-label='Benutzername']").setValue("owner");
    await wrapper.find("input[type='password']").setValue("ownerpass1");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(mockPost).toHaveBeenCalledWith("/api/auth/login", { username: "owner", password: "ownerpass1" });
    expect(wrapper.find(".protected").exists()).toBe(true);
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("submitting join redeems the invite and reveals the slot", async () => {
    window.history.pushState({}, "", "/?invite=abcd2345");
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      return Promise.reject(new ApiError("unauthorized", 401));
    });
    mockPost.mockResolvedValue({ token: "member-token" });

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    await wrapper.find("input[aria-label='Benutzername']").setValue("newmember");
    await wrapper.find("input[type='password']").setValue("memberpass1");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(mockPost).toHaveBeenCalledWith("/api/auth/register", {
      code: "ABCD2345",
      username: "newmember",
      password: "memberpass1",
    });
    expect(wrapper.find(".protected").exists()).toBe(true);
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("shows an error and stays gated when login is rejected", async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      return Promise.reject(new ApiError("unauthorized", 401));
    });
    mockPost.mockRejectedValue(new ApiError("unauthorized", 401));

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    await wrapper.find("input[aria-label='Benutzername']").setValue("owner");
    await wrapper.find("input[type='password']").setValue("wrong");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Benutzername oder Passwort falsch.");
    expect(wrapper.find(".gate").exists()).toBe(true);
    expect(wrapper.find(".protected").exists()).toBe(false);
    expect(wrapper.emitted("authenticated")).toBeUndefined();
  });

  it("shows a rate-limit message (not the generic wrong-password copy) on a 429 from login", async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      return Promise.reject(new ApiError("unauthorized", 401));
    });
    mockPost.mockRejectedValue(new ApiError("rate limited", 429));

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    await wrapper.find("input[aria-label='Benutzername']").setValue("owner");
    await wrapper.find("input[type='password']").setValue("wrong");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Zu viele Versuche");
    expect(wrapper.text()).not.toContain("Benutzername oder Passwort falsch.");
  });

  it("shows a password-too-weak message on a 400 whose detail names the common-password rejection", async () => {
    mockGet.mockResolvedValue({ needsSetup: true });
    mockPost.mockRejectedValue(new ApiError("invalid_request", 400, "password: too common, choose a different password"));

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    await wrapper.find("input[type='password']").setValue("password1");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Passwort zu unsicher");
    expect(wrapper.text()).not.toContain("Einrichtung fehlgeschlagen.");
  });

  it("keeps the generic setup error for a 400 that isn't the common-password rejection", async () => {
    mockGet.mockResolvedValue({ needsSetup: true });
    mockPost.mockRejectedValue(new ApiError("invalid_request", 400, "password: at least 8 characters"));

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    await wrapper.find("input[type='password']").setValue("short1");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Einrichtung fehlgeschlagen.");
  });

  it("toggles the password field between password and text on the eye button", async () => {
    mockGet.mockResolvedValue({ needsSetup: true });
    const wrapper = mountWithProviders(AuthGate);
    await flushPromises();

    const input = wrapper.find("input[aria-label='Passwort']");
    expect(input.attributes("type")).toBe("password");

    await wrapper.find("button.btn-secondary").trigger("click");
    expect(wrapper.find("input[aria-label='Passwort']").attributes("type")).toBe("text");
  });

  it("submits on Enter in the password field", async () => {
    mockGet.mockResolvedValue({ needsSetup: true });
    mockPost.mockResolvedValue({ token: "owner-token" });

    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div class='protected'>secret</div>" } });
    await flushPromises();

    const input = wrapper.find("input[aria-label='Passwort']");
    await input.setValue("ownerpass1");
    await input.trigger("keyup.enter");
    await flushPromises();

    expect(mockSetToken).toHaveBeenCalledWith("owner-token");
    expect(wrapper.find(".protected").exists()).toBe(true);
  });
});
