import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const { isNativeMock, isAndroidMock, getInfoMock, browserOpenMock } = vi.hoisted(() => ({
  isNativeMock: vi.fn().mockReturnValue(false),
  isAndroidMock: vi.fn().mockReturnValue(false),
  getInfoMock: vi.fn().mockResolvedValue({ version: "1.0.0" }),
  browserOpenMock: vi.fn(),
}));
vi.mock("~client/lib/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~client/lib/platform")>();
  return { ...actual, isNative: isNativeMock, isAndroid: isAndroidMock };
});
vi.mock("@capacitor/app", () => ({ App: { getInfo: getInfoMock } }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: browserOpenMock } }));
// useHealthConnectImport() runs isHealthConnectAvailable() unconditionally on every mount (its
// result decides whether the Health Connect card even renders) — unmocked, Health.isHealthAvailable
// throws "not implemented on web" under jsdom, same as any other native-only Capacitor plugin.
vi.mock("capacitor-health", () => ({
  Health: { isHealthAvailable: vi.fn().mockResolvedValue({ available: false }), requestHealthPermissions: vi.fn(), queryWorkouts: vi.fn() },
}));

import ProfilePage from "~client/pages/ProfilePage.vue";
import { useAppUpdate } from "~client/composables/useAppUpdate";
import { ApiError } from "~client/lib/api";

// Plain top-of-file consts (not vi.hoisted — `reactive` isn't available inside that factory, see
// RunsPage.test.ts's comment) referenced only inside uninvoked closures below, so vi.mock's own
// hoisting above these declarations never dereferences them before they exist.
const bodyweightState = reactive({
  entries: [] as { weightKg: number; date: string }[],
  loaded: false,
  error: false,
  latest: null as { weightKg: number; date: string } | null,
  load: vi.fn(),
  log: vi.fn(),
});
const themeState = reactive({ theme: "dark" as "dark" | "light", toggle: vi.fn() });
const xpState = reactive({ level: 3, totalXp: 450, showXp: true, loaded: false, toggleShowXp: vi.fn() });
const settingsState = reactive({
  profile: null as unknown,
  profileLoaded: false,
  ownedEquipment: null as string[] | null,
  gymSetup: null as unknown,
  load: vi.fn(),
  saveProfile: vi.fn(),
  saveEquipment: vi.fn(),
  saveGymSetup: vi.fn(),
});

vi.mock("~client/stores/bodyweightStore", () => ({ useBodyweightStore: () => bodyweightState }));
vi.mock("~client/stores/themeStore", () => ({ useThemeStore: () => themeState }));
vi.mock("~client/stores/xpStore", () => ({ useXpStore: () => xpState }));
vi.mock("~client/stores/settingsStore", () => ({ useSettingsStore: () => settingsState }));
vi.mock("~client/services/exportService", () => ({ fetchExportZip: vi.fn() }));
vi.mock("~client/services/authService", () => ({
  getMe: vi.fn(),
  listMembers: vi.fn(),
  createInvite: vi.fn(),
  removeMember: vi.fn(),
  logout: vi.fn(),
  deleteMyAccount: vi.fn(),
  getRecentErrors: vi.fn(),
  changeDisplayName: vi.fn(),
  changeUsername: vi.fn(),
  changePassword: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));

import * as authService from "~client/services/authService";

beforeEach(async () => {
  vi.clearAllMocks();
  isNativeMock.mockReturnValue(false);
  isAndroidMock.mockReturnValue(false);
  getInfoMock.mockResolvedValue({ version: "1.0.0" });
  localStorage.clear();
  // useAppUpdate.ts is a module-level singleton (see its header comment) — reset it directly
  // rather than re-importing the module, so a result from one test never leaks into the next.
  // currentVersion resets to __APP_VERSION__ (matching the module's own non-Android default,
  // isAndroidMock already false at this point), not null — non-Android never calls check() to
  // repopulate it.
  const appUpdate = useAppUpdate();
  appUpdate.currentVersion.value = __APP_VERSION__;
  appUpdate.latestVersion.value = null;
  appUpdate.downloadUrl.value = null;
  appUpdate.error.value = null;
  appUpdate.lastChecked.value = null;
  Object.assign(bodyweightState, { entries: [], loaded: false, error: false, latest: null });
  Object.assign(themeState, { theme: "dark" });
  Object.assign(xpState, { level: 3, totalXp: 450, showXp: true, loaded: false });
  Object.assign(settingsState, { profile: null, profileLoaded: false, ownedEquipment: null, gymSetup: null });
  // Object.assign onto the real URL constructor (not a `{ ...URL }` spread into a plain object,
  // which drops constructibility and broke `new URL(...)` for anything else in this file that
  // needs it, e.g. useServerConnection's normalizeServerUrl).
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() }));
  vi.mocked(authService.getMe).mockResolvedValue({ id: "u1", username: "owner", name: "Owner", role: "owner" });
  vi.mocked(authService.listMembers).mockResolvedValue([]);
  vi.mocked(authService.listSessions).mockResolvedValue([]);
});

describe("ProfilePage", () => {
  it("loads bodyweight and (unloaded) settings on mount", () => {
    mountWithProviders(ProfilePage);
    expect(bodyweightState.load).toHaveBeenCalledOnce();
    expect(settingsState.load).toHaveBeenCalledOnce();
  });

  it("doesn't re-fetch settings once already loaded", () => {
    settingsState.profileLoaded = true;
    mountWithProviders(ProfilePage);
    expect(settingsState.load).not.toHaveBeenCalled();
  });

  it("shows the 75kg-fallback hint when no bodyweight has been logged yet, and the latest entry once it has", async () => {
    const wrapper = mountWithProviders(ProfilePage);
    expect(wrapper.text()).toContain("nutzt die Rang-Berechnung vorläufig 75 kg");

    bodyweightState.latest = { weightKg: 82.4, date: "2026-09-01" };
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("82.4 kg");
    expect(wrapper.text()).toContain("2026-09-01");
  });

  it("keeps the bodyweight equipment chip permanently active and never toggles it off", async () => {
    const wrapper = mountWithProviders(ProfilePage);
    const bwChip = wrapper.findAll(".chip").find((c) => c.text().includes("Körpergewicht"))!;
    expect(bwChip.classes()).toContain("active");
    expect(bwChip.classes()).toContain("locked");

    await bwChip.trigger("click");
    expect(bwChip.classes()).toContain("active"); // still active — bodyweight can't be deselected
  });

  it("shows XP/level stats once xpStore has loaded, and toggles visibility on tap", async () => {
    xpState.loaded = true;
    const wrapper = mountWithProviders(ProfilePage);

    expect(wrapper.text()).toContain("Lv. 3");
    expect(wrapper.text()).toContain("XP erscheinen im Workout");

    const toggleBtn = wrapper.findAll(".bw-row button").find((b) => b.text() === "Ausblenden")!;
    await toggleBtn.trigger("click");
    expect(xpState.toggleShowXp).toHaveBeenCalledOnce();
  });

  it("toggles the theme by tapping the inactive chip", async () => {
    const wrapper = mountWithProviders(ProfilePage);
    const lightChip = wrapper.findAll(".card--quiet .chip").find((c) => c.text() === "Hell")!;

    await lightChip.trigger("click");
    expect(themeState.toggle).toHaveBeenCalledOnce();
  });

  it("downloads the export zip on tap and surfaces an error message if it fails", async () => {
    const { fetchExportZip } = await import("~client/services/exportService");
    vi.mocked(fetchExportZip).mockRejectedValueOnce(new Error("Export fehlgeschlagen: 500"));

    const wrapper = mountWithProviders(ProfilePage);
    const exportBtn = wrapper.findAll(".card--quiet button").find((b) => b.text().includes("Backup herunterladen"))!;

    await exportBtn.trigger("click");
    await flushAsync();

    expect(fetchExportZip).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain("Export fehlgeschlagen: 500");
  });

  it("shows the members section and lets the owner generate an invite code", async () => {
    vi.mocked(authService.createInvite).mockResolvedValue({ code: "ABCD2345", expiresAt: new Date().toISOString() });

    const wrapper = mountWithProviders(ProfilePage);
    await flushAsync();

    expect(wrapper.text()).toContain("Mitglieder");
    const inviteBtn = wrapper.findAll(".card--quiet button").find((b) => b.text().includes("Einladungscode erstellen"))!;
    await inviteBtn.trigger("click");
    await flushAsync();

    expect(wrapper.text()).toContain("ABCD2345");
  });

  it("hides the members section for a non-owner", async () => {
    vi.mocked(authService.getMe).mockResolvedValue({ id: "u2", username: "member1", name: "Member", role: "member" });

    const wrapper = mountWithProviders(ProfilePage);
    await flushAsync();

    expect(wrapper.text()).not.toContain("Mitglieder");
    expect(authService.listMembers).not.toHaveBeenCalled();
  });

  it("removes a member and refreshes the list", async () => {
    vi.mocked(authService.listMembers)
      .mockResolvedValueOnce([{ id: "m1", username: "bob", name: "Bob", role: "member", createdAt: "2026-01-01" }])
      .mockResolvedValueOnce([]);

    const wrapper = mountWithProviders(ProfilePage);
    await flushAsync();

    expect(wrapper.text()).toContain("Bob");
    const removeBtn = wrapper.findAll(".member-row button").find((b) => b.text() === "Entfernen")!;
    await removeBtn.trigger("click");
    await flushAsync();

    expect(authService.removeMember).toHaveBeenCalledWith("m1");
    expect(wrapper.text()).not.toContain("Bob");
  });

  it("hides the Server section on web", () => {
    const wrapper = mountWithProviders(ProfilePage);
    expect(wrapper.findAll(".eyebrow").some((e) => e.text() === "Server")).toBe(false);
  });

  it("shows the current server URL on native, with a way to change it", async () => {
    isNativeMock.mockReturnValue(true);
    localStorage.setItem("liftr.serverUrl", "https://liftr.example.com");

    const wrapper = mountWithProviders(ProfilePage);

    expect(wrapper.text()).toContain("https://liftr.example.com");
    expect(wrapper.find("input[aria-label='Server-Adresse']").exists()).toBe(false);

    await wrapper.findAll("button").find((b) => b.text() === "Ändern")!.trigger("click");
    expect(wrapper.find("input[aria-label='Server-Adresse']").exists()).toBe(true);
  });

  it("verifies and saves a changed server URL, then reloads", async () => {
    isNativeMock.mockReturnValue(true);
    localStorage.setItem("liftr.serverUrl", "https://old.example.com");
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, service: "liftr" }) }),
    );

    const wrapper = mountWithProviders(ProfilePage);
    // "Speichern" isn't unique to this section (bodyweight/profile/equipment/gym cards each have
    // their own) — scope every lookup after "Ändern" to the Server section itself.
    // Server/Version/Diagnose all live inside one merged "Konto & App" CollapsibleCard now, so a
    // section can have several .eyebrow elements (the card's own title plus each sub-heading) —
    // match any of them, not just the first.
    const section = wrapper.findAll("section").find((s) => s.findAll(".eyebrow").some((e) => e.text() === "Server"))!;
    await section.findAll("button").find((b) => b.text() === "Ändern")!.trigger("click");
    await section.find("input[aria-label='Server-Adresse']").setValue("new.example.com");
    await section.findAll("button").find((b) => b.text() === "Speichern")!.trigger("click");
    await flushPromises();

    expect(localStorage.getItem("liftr.serverUrl")).toBe("https://new.example.com");
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it("shows only the version (no update-check UI) on non-Android", () => {
    const wrapper = mountWithProviders(ProfilePage);

    const section = wrapper.findAll("section").find((s) => s.findAll(".eyebrow").some((e) => e.text() === "Version"))!;
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain("v0.0.0-test");
    // No update-check buttons (Server/Diagnose/Abmelden share this now-merged card and do have
    // their own buttons, so this checks specifically for the absence of update-check UI).
    expect(section.findAll("button").some((b) => ["Nach Updates suchen", "Herunterladen"].includes(b.text()))).toBe(false);
    expect(getInfoMock).not.toHaveBeenCalled();
  });

  it("shows the current version, checks for an update on mount, and offers a download once one is found", async () => {
    isAndroidMock.mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ tag_name: "v1.2.0", assets: [{ name: "liftr.apk", browser_download_url: "https://gh.example/liftr.apk" }] }),
      }),
    );

    const wrapper = mountWithProviders(ProfilePage);
    await flushPromises();

    const section = wrapper.findAll("section").find((s) => s.findAll(".eyebrow").some((e) => e.text() === "Version"))!;
    expect(section.text()).toContain("v1.0.0");
    expect(section.text()).toContain("Update verfügbar: v1.2.0");

    await section.findAll("button").find((b) => b.text() === "Herunterladen")!.trigger("click");
    expect(browserOpenMock).toHaveBeenCalledWith({ url: "https://gh.example/liftr.apk" });
  });

  it("re-checks for an update on demand", async () => {
    isAndroidMock.mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ tag_name: "v1.0.0", assets: [] }) }),
    );

    const wrapper = mountWithProviders(ProfilePage);
    await flushPromises();

    const section = wrapper.findAll("section").find((s) => s.findAll(".eyebrow").some((e) => e.text() === "Version"))!;
    expect(section.text()).not.toContain("Update verfügbar");

    await section.findAll("button").find((b) => b.text() === "Nach Updates suchen")!.trigger("click");
    await flushPromises();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("logs out and reloads the page", async () => {
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });

    const wrapper = mountWithProviders(ProfilePage);
    await flushAsync();

    const logoutBtn = wrapper.findAll("button").find((b) => b.text() === "Abmelden")!;
    await logoutBtn.trigger("click");
    await flushAsync();

    expect(authService.logout).toHaveBeenCalledOnce();
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  function findCard(wrapper: VueWrapper, title: string) {
    return wrapper.findAll("section").find((s) => s.findAll(".eyebrow").some((e) => e.text() === title))!;
  }

  it("saves a changed display name without asking for a password", async () => {
    vi.mocked(authService.changeDisplayName).mockResolvedValue({ id: "u1", username: "owner", name: "Owner II", role: "owner" });

    const wrapper = mountWithProviders(ProfilePage);
    await flushAsync();

    const card = findCard(wrapper, "Anmeldedaten");
    await card.find("input[autocomplete='name']").setValue("Owner II");
    await card.findAll("button").find((b) => b.text() === "Anzeigename speichern")!.trigger("click");
    await flushAsync();

    expect(authService.changeDisplayName).toHaveBeenCalledWith("Owner II");
    expect(card.text()).toContain("Gespeichert.");
  });

  it("changes the username with the current password and reports other devices were signed out", async () => {
    vi.mocked(authService.changeUsername).mockResolvedValue({ id: "u1", username: "newname", name: "Owner", role: "owner" });

    const wrapper = mountWithProviders(ProfilePage);
    await flushAsync();

    const card = findCard(wrapper, "Anmeldedaten");
    await card.find("input[autocomplete='username']").setValue("newname");
    await card.find("input[autocomplete='current-password']").setValue("currentpass1");
    await card.findAll("button").find((b) => b.text() === "Benutzername ändern")!.trigger("click");
    await flushAsync();

    expect(authService.changeUsername).toHaveBeenCalledWith("currentpass1", "newname");
    expect(card.text()).toContain("Andere Geräte wurden abgemeldet.");
  });

  it("shows 'Aktuelles Passwort falsch.' when the username change is rejected with 401", async () => {
    vi.mocked(authService.changeUsername).mockRejectedValue(new ApiError("unauthorized", 401));

    const wrapper = mountWithProviders(ProfilePage);
    await flushAsync();

    const card = findCard(wrapper, "Anmeldedaten");
    await card.find("input[autocomplete='username']").setValue("newname");
    await card.find("input[autocomplete='current-password']").setValue("wrong");
    await card.findAll("button").find((b) => b.text() === "Benutzername ändern")!.trigger("click");
    await flushAsync();

    expect(card.text()).toContain("Aktuelles Passwort falsch.");
  });

  it("changes the password and reports other devices were signed out", async () => {
    vi.mocked(authService.changePassword).mockResolvedValue(undefined);

    const wrapper = mountWithProviders(ProfilePage);
    await flushAsync();

    const card = findCard(wrapper, "Anmeldedaten");
    const passwordInputs = card.findAll("input[autocomplete='current-password'], input[autocomplete='new-password']");
    await passwordInputs[1]!.setValue("currentpass1"); // second current-password field belongs to the password form
    await passwordInputs[2]!.setValue("newpass1");
    await card.findAll("button").find((b) => b.text() === "Passwort ändern")!.trigger("click");
    await flushAsync();

    expect(authService.changePassword).toHaveBeenCalledWith("currentpass1", "newpass1");
    expect(card.text()).toContain("Andere Geräte wurden abgemeldet.");
  });

  it("lists active sessions with exactly one 'Dieses Gerät' badge and lets a non-current one be revoked", async () => {
    vi.mocked(authService.listSessions).mockResolvedValue([
      { id: "s1", createdAt: "2026-01-01", lastUsedAt: "2026-01-02", expiresAt: "2026-02-01", absoluteExpiresAt: "2026-04-01", device: "Chrome · Windows", current: true },
      { id: "s2", createdAt: "2026-01-01", lastUsedAt: "2026-01-02", expiresAt: "2026-02-01", absoluteExpiresAt: "2026-04-01", device: "Safari · iPhone", current: false },
    ]);

    const wrapper = mountWithProviders(ProfilePage);
    await flushPromises();

    const card = findCard(wrapper, "Aktive Sitzungen");
    expect(card.text()).toContain("Dieses Gerät");
    expect(card.findAll(".session-badge")).toHaveLength(1);

    await card.findAll(".member-row button").find((b) => b.text() === "Abmelden")!.trigger("click");
    await flushAsync();

    expect(authService.revokeSession).toHaveBeenCalledWith("s2");
    expect(card.text()).not.toContain("Safari · iPhone");
  });

  it("revokes every other session after a two-tap confirm", async () => {
    vi.mocked(authService.listSessions).mockResolvedValue([
      { id: "s1", createdAt: "2026-01-01", lastUsedAt: "2026-01-02", expiresAt: "2026-02-01", absoluteExpiresAt: "2026-04-01", device: "Chrome · Windows", current: true },
      { id: "s2", createdAt: "2026-01-01", lastUsedAt: "2026-01-02", expiresAt: "2026-02-01", absoluteExpiresAt: "2026-04-01", device: "Safari · iPhone", current: false },
    ]);
    vi.mocked(authService.revokeOtherSessions).mockResolvedValue(undefined);

    const wrapper = mountWithProviders(ProfilePage);
    await flushPromises();

    const card = findCard(wrapper, "Aktive Sitzungen");
    const revokeAllBtn = card.findAll("button").find((b) => b.text().includes("Alle anderen Geräte abmelden"))!;
    await revokeAllBtn.trigger("click");
    expect(authService.revokeOtherSessions).not.toHaveBeenCalled();
    await revokeAllBtn.trigger("click");
    await flushAsync();

    expect(authService.revokeOtherSessions).toHaveBeenCalledOnce();
  });
});

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}
