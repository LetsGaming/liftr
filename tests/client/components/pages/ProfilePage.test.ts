import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import ProfilePage from "~client/pages/ProfilePage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

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

beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(bodyweightState, { entries: [], loaded: false, error: false, latest: null });
  Object.assign(themeState, { theme: "dark" });
  Object.assign(xpState, { level: 3, totalXp: 450, showXp: true, loaded: false });
  Object.assign(settingsState, { profile: null, profileLoaded: false, ownedEquipment: null, gymSetup: null });
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
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
});

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}
