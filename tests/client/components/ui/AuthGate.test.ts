import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// AuthGate imports { ApiError, api, setToken } from "../../lib/api" (relative from its own
// file), which resolves to the same absolute packages/client/src/lib/api.ts that the ~client
// alias points at — so mocking "~client/lib/api" here does apply to it (tests/README.md).
// ApiError itself needs to stay the *real* class (AuthGate does `err instanceof ApiError`), so
// only api.get and setToken are overridden via importOriginal instead of replacing the module
// wholesale.
const { mockGet, mockSetToken } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSetToken: vi.fn(),
}));
vi.mock("~client/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~client/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, get: mockGet },
    setToken: mockSetToken,
  };
});

import { ApiError } from "~client/lib/api";
import AuthGate from "~client/components/ui/AuthGate.vue";

beforeEach(() => {
  mockGet.mockReset();
  mockSetToken.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthGate", () => {
  it("renders the slot content once the initial health check succeeds (no token needed)", async () => {
    mockGet.mockResolvedValue({ ok: true });

    const wrapper = mountWithProviders(AuthGate, {
      slots: { default: "<div class='protected'>secret content</div>" },
    });
    await flushPromises();

    expect(wrapper.find(".protected").exists()).toBe(true);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("renders the slot content (lets the app through) when the initial check fails offline, not with a 401", async () => {
    mockGet.mockRejectedValue(new TypeError("Failed to fetch"));

    const wrapper = mountWithProviders(AuthGate, {
      slots: { default: "<div class='protected'>secret content</div>" },
    });
    await flushPromises();

    expect(wrapper.find(".protected").exists()).toBe(true);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("shows the token gate instead of the slot when the initial check 401s", async () => {
    mockGet.mockRejectedValue(new ApiError("GET /api/health failed: 401", 401));

    const wrapper = mountWithProviders(AuthGate, {
      slots: { default: "<div class='protected'>secret content</div>" },
    });
    await flushPromises();

    expect(wrapper.find(".gate").exists()).toBe(true);
    expect(wrapper.find(".protected").exists()).toBe(false);
    expect(wrapper.text()).toContain("Dieser Server ist mit einem Token gesichert.");
  });

  it("disables the unlock button until a token is typed", async () => {
    mockGet.mockRejectedValue(new ApiError("unauthorized", 401));
    const wrapper = mountWithProviders(AuthGate);
    await flushPromises();

    const submitBtn = wrapper.find("button.btn-primary");
    expect(submitBtn.attributes("disabled")).toBeDefined();

    await wrapper.find("input[type=password]").setValue("abc123");
    expect(wrapper.find("button.btn-primary").attributes("disabled")).toBeUndefined();
  });

  it("submits the typed token, and on success stores it and reveals the slot", async () => {
    mockGet.mockRejectedValueOnce(new ApiError("unauthorized", 401));
    mockGet.mockResolvedValueOnce({ ok: true }); // the re-check after submit succeeds

    const wrapper = mountWithProviders(AuthGate, {
      slots: { default: "<div class='protected'>secret content</div>" },
    });
    await flushPromises();

    await wrapper.find("input[type=password]").setValue("  my-token  ");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(mockSetToken).toHaveBeenCalledWith("my-token"); // trimmed
    expect(wrapper.find(".protected").exists()).toBe(true);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("shows an error and stays gated when the submitted token is rejected", async () => {
    mockGet.mockRejectedValueOnce(new ApiError("unauthorized", 401));
    mockGet.mockRejectedValueOnce(new ApiError("unauthorized", 401)); // re-check after submit also fails

    const wrapper = mountWithProviders(AuthGate, {
      slots: { default: "<div class='protected'>secret content</div>" },
    });
    await flushPromises();

    await wrapper.find("input[type=password]").setValue("wrong-token");
    await wrapper.find("button.btn-primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Token abgelehnt");
    expect(wrapper.find(".gate").exists()).toBe(true);
    expect(wrapper.find(".protected").exists()).toBe(false);
  });

  it("toggles the token field between password and text on the eye button", async () => {
    mockGet.mockRejectedValue(new ApiError("unauthorized", 401));
    const wrapper = mountWithProviders(AuthGate);
    await flushPromises();

    const input = wrapper.find("input[aria-label='API-Token']");
    expect(input.attributes("type")).toBe("password");

    await wrapper.find("button.btn-secondary").trigger("click");
    expect(wrapper.find("input[aria-label='API-Token']").attributes("type")).toBe("text");
  });

  it("submits on Enter in the token field", async () => {
    mockGet.mockRejectedValueOnce(new ApiError("unauthorized", 401));
    mockGet.mockResolvedValueOnce({ ok: true });

    const wrapper = mountWithProviders(AuthGate, {
      slots: { default: "<div class='protected'>secret content</div>" },
    });
    await flushPromises();

    const input = wrapper.find("input[aria-label='API-Token']");
    await input.setValue("enter-token");
    await input.trigger("keyup.enter");
    await flushPromises();

    expect(mockSetToken).toHaveBeenCalledWith("enter-token");
    expect(wrapper.find(".protected").exists()).toBe(true);
  });
});
