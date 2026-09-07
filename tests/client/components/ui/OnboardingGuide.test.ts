// OnboardingGuide.vue is the multi-step setup wizard shown once via App.vue when
// settingsStore.needsOnboarding is true. It's built on SheetModal.vue, which is stubbed here via
// the shared stubSheetModal() helper (same convention as RpeCapture/NoteCapture/SetKindPicker's
// tests) — that helper's own header comment explains why: @ionic/vue's real IonModal
// self-registers/hydrates as a real Stencil custom element even under jsdom, and never projects
// slot content into visible light DOM without the native runtime driving its open/present
// lifecycle, so testing anything nested inside SheetModal needs it stubbed one level up.
//
// Every real step component (WelcomeStep, AboutStep, ExperienceStep, ...) renders for real here
// (not stubbed), matching tests/README.md's "prefer exercising real collaborators" guidance —
// only the network boundary (settingsService, underneath settingsStore) is mocked.
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveProfileMock, saveOwnedEquipmentMock, saveGymSetupMock, getProfileMock, getOwnedEquipmentMock, getGymSetupMock } = vi.hoisted(() => ({
  saveProfileMock: vi.fn(),
  saveOwnedEquipmentMock: vi.fn(),
  saveGymSetupMock: vi.fn(),
  getProfileMock: vi.fn(),
  getOwnedEquipmentMock: vi.fn(),
  getGymSetupMock: vi.fn(),
}));

vi.mock("~client/services/settingsService", () => ({
  getProfile: getProfileMock,
  getOwnedEquipment: getOwnedEquipmentMock,
  getGymSetup: getGymSetupMock,
  saveProfile: saveProfileMock,
  saveOwnedEquipment: saveOwnedEquipmentMock,
  saveGymSetup: saveGymSetupMock,
}));

import OnboardingGuide from "~client/components/ui/OnboardingGuide.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";
import { stubSheetModal } from "../../helpers/stubSheetModal";

function mountGuide() {
  const { SheetModalStub, dismiss } = stubSheetModal();
  const wrapper = mountWithProviders(OnboardingGuide, { global: { stubs: { SheetModal: SheetModalStub } } });
  return { wrapper, dismiss };
}

type Wrapper = ReturnType<typeof mountGuide>["wrapper"];

function stepLabel(wrapper: Wrapper) {
  return wrapper.find(".step-label").text();
}

function clickNext(wrapper: Wrapper) {
  return wrapper.find(".wizard-actions .btn-primary").trigger("click");
}

function clickBack(wrapper: Wrapper) {
  return wrapper.find(".wizard-actions .btn-secondary").trigger("click");
}

/** welcome -> about -> experience (picks the first option, "Anfänger") -> frequency -> equipment.
 *  Lands on the equipment step (bodyweight preselected, so it never blocks continuing) — the
 *  common jumping-off point most tests below need before doing their own thing. */
async function advanceToEquipmentStep(wrapper: Wrapper) {
  await clickNext(wrapper); // welcome -> about
  await clickNext(wrapper); // about -> experience
  await wrapper.findAll(".option-row")[0]?.trigger("click"); // pick "Anfänger" (unblocks Weiter)
  await clickNext(wrapper); // experience -> frequency
  await clickNext(wrapper); // frequency -> equipment
}

function findChipByText(wrapper: Wrapper, selector: string, text: string) {
  return wrapper.findAll(selector).find((el) => el.text().includes(text));
}

beforeEach(() => {
  saveProfileMock.mockReset().mockResolvedValue({});
  saveOwnedEquipmentMock.mockReset().mockResolvedValue({ equipment: [] });
  saveGymSetupMock.mockReset().mockResolvedValue({});
  getProfileMock.mockReset();
  getOwnedEquipmentMock.mockReset();
  getGymSetupMock.mockReset();
});

describe("OnboardingGuide", () => {
  it("starts on the welcome step, 1 of 6 (no plates step by default)", () => {
    const { wrapper } = mountGuide();

    expect(stepLabel(wrapper)).toBe("Start · 1/6");
    expect(wrapper.text()).toContain("Willkommen bei Liftr");
    expect(wrapper.find(".wizard-actions .btn-secondary").exists()).toBe(false); // isFirst hides "Zurück"
  });

  it("sets the progress bar's fill to reflect (step+1)/total, from 17% to 100%", async () => {
    const { wrapper } = mountGuide();
    expect(wrapper.find(".progress-fill").attributes("style")).toContain("scaleX(0.17)");

    await advanceToEquipmentStep(wrapper); // 5/6
    await clickNext(wrapper); // -> done, 6/6

    expect(stepLabel(wrapper)).toBe("Fertig · 6/6");
    expect(wrapper.find(".progress-fill").attributes("style")).toContain("scaleX(1)");
  });

  it("advances welcome -> about on Weiter, and back again on Zurück", async () => {
    const { wrapper } = mountGuide();

    await clickNext(wrapper);
    expect(stepLabel(wrapper)).toBe("Über dich · 2/6");
    expect(wrapper.text()).toContain("Über dich");

    await clickBack(wrapper);
    expect(stepLabel(wrapper)).toBe("Start · 1/6");
    expect(wrapper.text()).toContain("Willkommen bei Liftr");
  });

  it("blocks continuing past the experience step until a level is picked", async () => {
    const { wrapper } = mountGuide();
    await clickNext(wrapper); // -> about
    await clickNext(wrapper); // -> experience

    expect(stepLabel(wrapper)).toBe("Erfahrung · 3/6");
    expect(wrapper.find(".wizard-actions .btn-primary").attributes("disabled")).toBeDefined();

    const beginnerOption = findChipByText(wrapper, ".option-row", "Anfänger");
    await beginnerOption?.trigger("click");

    expect(wrapper.find(".wizard-actions .btn-primary").attributes("disabled")).toBeUndefined();
    await clickNext(wrapper);
    expect(stepLabel(wrapper)).toBe("Häufigkeit · 4/6");
  });

  it("does not gate the equipment step, since bodyweight is preselected by default", async () => {
    const { wrapper } = mountGuide();
    await advanceToEquipmentStep(wrapper);

    expect(stepLabel(wrapper)).toBe("Equipment · 5/6");
    expect(wrapper.find(".wizard-actions .btn-primary").attributes("disabled")).toBeUndefined();
  });

  it("inserts a plates step only once a barbell-family item is picked on the equipment step", async () => {
    const { wrapper } = mountGuide();
    await advanceToEquipmentStep(wrapper);
    expect(stepLabel(wrapper)).toBe("Equipment · 5/6");

    const barbellChip = findChipByText(wrapper, ".equip-chip", "Langhantel");
    await barbellChip?.trigger("click");
    await clickNext(wrapper);

    expect(stepLabel(wrapper)).toBe("Scheiben · 6/7");
    expect(wrapper.text()).toContain("Scheiben & Stange");
  });

  it("skip() marks onboarding as seen with an empty profile and dismisses the sheet", async () => {
    const { wrapper, dismiss } = mountGuide();

    await wrapper.find(".skip-btn").trigger("click");
    await flushPromises();

    expect(saveProfileMock).toHaveBeenCalledWith({});
    expect(saveOwnedEquipmentMock).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("finish() saves only the fields the user actually filled in, and skips gym setup with no barbell-family equipment", async () => {
    const { wrapper, dismiss } = mountGuide();
    await advanceToEquipmentStep(wrapper); // about/weight/birth year left blank
    await clickNext(wrapper); // -> done

    expect(stepLabel(wrapper)).toBe("Fertig · 6/6");
    await clickNext(wrapper); // "Los geht's"
    await flushPromises();

    expect(saveProfileMock).toHaveBeenCalledWith({ experienceLevel: "beginner", workoutsPerWeek: 3 });
    expect(saveOwnedEquipmentMock).toHaveBeenCalledWith(["bodyweight"]);
    expect(saveGymSetupMock).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("finish() saves gym setup once a bar weight was actually touched, even with an empty plate inventory", async () => {
    const { wrapper } = mountGuide();
    await advanceToEquipmentStep(wrapper);
    const barbellChip = findChipByText(wrapper, ".equip-chip", "Langhantel");
    await barbellChip?.trigger("click");
    await clickNext(wrapper); // -> plates

    expect(wrapper.text()).toContain("Scheiben & Stange");
    const moreBarbellWeight = wrapper.find('[aria-label="Mehr Langhantel"]');
    await moreBarbellWeight.trigger("click"); // 20kg -> 21kg
    await clickNext(wrapper); // -> done

    await clickNext(wrapper); // "Los geht's"
    await flushPromises();

    expect(saveGymSetupMock).toHaveBeenCalledWith({ barWeights: { barbell: 21 }, plates: [] });
  });
});
