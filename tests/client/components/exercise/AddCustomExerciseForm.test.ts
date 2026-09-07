import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createExerciseMock, getExercisesMock } = vi.hoisted(() => ({
  createExerciseMock: vi.fn(),
  getExercisesMock: vi.fn(),
}));

vi.mock("~client/services/exerciseService", () => ({
  createExercise: createExerciseMock,
  getExercises: getExercisesMock,
}));

import AddCustomExerciseForm from "~client/components/exercise/AddCustomExerciseForm.vue";
import { i18n } from "~client/i18n";
import { useCatalogStore } from "~client/stores/catalogStore";
import { createTestRouter, mountWithProviders } from "../../helpers/mountWithProviders";

/** Finds the `.field` block by its visible `.field-label` text, rather than a brittle index —
 *  the Gerät field only renders while `!isBodyweight`, which shifts every later field's index. */
function fieldByLabel(wrapper: ReturnType<typeof mountForm>["wrapper"], label: string) {
  return wrapper.findAll(".field").find((f) => f.find(".field-label").exists() && f.find(".field-label").text() === label)!;
}

function mountForm() {
  const pinia = createPinia();
  return {
    wrapper: mountWithProviders(AddCustomExerciseForm, {
      global: { plugins: [pinia, i18n, createTestRouter()] },
    }),
    pinia,
  };
}

async function fillMinimalValidForm(wrapper: ReturnType<typeof mountForm>["wrapper"]) {
  await wrapper.find('input[type="text"]').setValue("Kabelzug Facepull");
  await wrapper.findAll(".muscle-chip")[0]!.trigger("click"); // any primary muscle
}

beforeEach(() => {
  createExerciseMock.mockReset();
  getExercisesMock.mockReset();
  getExercisesMock.mockResolvedValue([]);
  localStorage.clear();
});

describe("AddCustomExerciseForm", () => {
  it("save is disabled until a name and a primary muscle are both set", async () => {
    const { wrapper } = mountForm();
    const saveBtn = wrapper.find(".btn-primary");
    expect(saveBtn.attributes("disabled")).toBeDefined();

    await wrapper.find('input[type="text"]').setValue("Kabelzug Facepull");
    expect(saveBtn.attributes("disabled")).toBeDefined(); // still no primary muscle

    await wrapper.findAll(".muscle-chip")[0]!.trigger("click");
    expect(saveBtn.attributes("disabled")).toBeUndefined();
  });

  it("shows a live slug preview derived from the typed name", async () => {
    const { wrapper } = mountForm();

    await wrapper.find('input[type="text"]').setValue("Kabelzug Facepull");

    expect(wrapper.find(".slug-preview").text()).toBe("wird gespeichert als: kabelzug-facepull");
  });

  it("transliterates German umlauts/ß in the slug instead of dropping them", async () => {
    const { wrapper } = mountForm();

    await wrapper.find('input[type="text"]').setValue("Bankdrücken Übung groß");

    expect(wrapper.find(".slug-preview").text()).toBe("wird gespeichert als: bankdruecken-uebung-gross");
  });

  it("shows no slug preview for an empty/blank name", async () => {
    const { wrapper } = mountForm();

    await wrapper.find('input[type="text"]').setValue("   ");

    expect(wrapper.find(".slug-preview").exists()).toBe(false);
  });

  it("selecting a primary muscle chip marks only that chip active", async () => {
    const { wrapper } = mountForm();
    const chips = wrapper.findAll(".muscle-chip");

    await chips[0]!.trigger("click");
    expect(chips[0]!.classes()).toContain("active");
    expect(chips[1]!.classes()).not.toContain("active");

    await chips[1]!.trigger("click");
    expect(chips[0]!.classes()).not.toContain("active");
    expect(chips[1]!.classes()).toContain("active");
  });

  it("the secondary-muscle grid excludes whichever muscle is currently primary", async () => {
    const { wrapper } = mountForm();
    const primaryGrid = fieldByLabel(wrapper, "Hauptmuskel");
    const firstPrimaryLabel = primaryGrid.findAll(".muscle-chip")[0]!.text();
    await primaryGrid.findAll(".muscle-chip")[0]!.trigger("click");

    const secondaryGrid = fieldByLabel(wrapper, "Weitere Muskeln (optional)");
    const secondaryLabels = secondaryGrid.findAll(".muscle-chip").map((c) => c.text());
    expect(secondaryLabels).not.toContain(firstPrimaryLabel);
  });

  it("toggles a secondary muscle chip on and off by clicking it twice", async () => {
    const { wrapper } = mountForm();
    const secondaryGrid = fieldByLabel(wrapper, "Weitere Muskeln (optional)");
    const chip = secondaryGrid.findAll(".muscle-chip")[0]!;

    await chip.trigger("click");
    expect(chip.classes()).toContain("active");

    await chip.trigger("click");
    expect(chip.classes()).not.toContain("active");
  });

  it("checking 'Eigengewichtsübung' hides the equipment field and clears any chosen equipment", async () => {
    const { wrapper } = mountForm();
    expect(wrapper.findAll("select")).toHaveLength(2); // Bewegungsmuster + Gerät
    await fieldByLabel(wrapper, "Gerät").find("select").setValue("dumbbell");

    await wrapper.find('input[type="checkbox"]').setValue(true);

    // The whole Gerät field (and its <select>) is gone once isBodyweight is checked.
    expect(wrapper.findAll("select")).toHaveLength(1); // only Bewegungsmuster remains
    expect(fieldByLabel(wrapper, "Gerät")).toBeUndefined();
  });

  it("clicking Abbrechen emits cancel without saving", async () => {
    const { wrapper } = mountForm();

    await wrapper.find(".btn-secondary").trigger("click");

    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(createExerciseMock).not.toHaveBeenCalled();
  });

  it("clicking save while disabled does nothing", async () => {
    const { wrapper } = mountForm();

    await wrapper.find(".btn-primary").trigger("click");

    expect(createExerciseMock).not.toHaveBeenCalled();
    expect(wrapper.emitted("created")).toBeUndefined();
  });

  it("saves with the typed name (not the slug) as the exercise's name, and emits created on success", async () => {
    createExerciseMock.mockResolvedValue({ id: "ex-9", slug: "kabelzug-facepull" });
    const { wrapper } = mountForm();
    await fillMinimalValidForm(wrapper);

    await wrapper.find(".btn-primary").trigger("click");
    await Promise.resolve();
    await Promise.resolve();

    expect(createExerciseMock).toHaveBeenCalledTimes(1);
    const input = createExerciseMock.mock.calls[0]![0];
    expect(input.name).toBe("Kabelzug Facepull");
    expect(input.slug).toBe("kabelzug-facepull");
    expect(input.movementPattern).toBe("squat"); // default selection
    expect(input.isBodyweight).toBe(false);
    expect(input.muscleSlugs[0]).toMatchObject({ role: "primary" });
    expect(wrapper.emitted("created")).toHaveLength(1);
  });

  it("omits equipment from the payload once bodyweight is checked", async () => {
    createExerciseMock.mockResolvedValue({ id: "ex-9", slug: "kabelzug-facepull" });
    const { wrapper } = mountForm();
    await fillMinimalValidForm(wrapper);
    await wrapper.find('input[type="checkbox"]').setValue(true);

    await wrapper.find(".btn-primary").trigger("click");
    await Promise.resolve();
    await Promise.resolve();

    const input = createExerciseMock.mock.calls[0]![0];
    expect(input.equipment).toBeUndefined();
    expect(input.isBodyweight).toBe(true);
  });

  it("includes toggled secondary muscles alongside the primary in muscleSlugs", async () => {
    createExerciseMock.mockResolvedValue({ id: "ex-9", slug: "kabelzug-facepull" });
    const { wrapper } = mountForm();
    await wrapper.find('input[type="text"]').setValue("Kabelzug Facepull");
    const primaryChip = fieldByLabel(wrapper, "Hauptmuskel").findAll(".muscle-chip")[0]!;
    await primaryChip.trigger("click");
    const secondaryChip = fieldByLabel(wrapper, "Weitere Muskeln (optional)").findAll(".muscle-chip")[0]!;
    await secondaryChip.trigger("click");

    await wrapper.find(".btn-primary").trigger("click");
    await Promise.resolve();
    await Promise.resolve();

    const input = createExerciseMock.mock.calls[0]![0];
    expect(input.muscleSlugs).toHaveLength(2);
    expect(input.muscleSlugs[0].role).toBe("primary");
    expect(input.muscleSlugs[1].role).toBe("secondary");
  });

  it("reloads the catalog after a successful save", async () => {
    createExerciseMock.mockResolvedValue({ id: "ex-9", slug: "kabelzug-facepull" });
    const { wrapper, pinia } = mountForm();
    await fillMinimalValidForm(wrapper);

    await wrapper.find(".btn-primary").trigger("click");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(getExercisesMock).toHaveBeenCalledTimes(1);
    expect(useCatalogStore(pinia).loaded).toBe(true);
  });

  it("shows 'Wird gespeichert…' and disables save while the request is in flight", async () => {
    let resolveCreate!: (value: { id: string; slug: string }) => void;
    createExerciseMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const { wrapper } = mountForm();
    await fillMinimalValidForm(wrapper);

    const clickPromise = wrapper.find(".btn-primary").trigger("click");
    await Promise.resolve();

    expect(wrapper.find(".btn-primary").text()).toBe("Wird gespeichert…");
    expect(wrapper.find(".btn-primary").attributes("disabled")).toBeDefined();

    resolveCreate({ id: "ex-9", slug: "kabelzug-facepull" });
    await clickPromise;
  });

  it("shows an error message and re-enables save when the request fails, without emitting created", async () => {
    createExerciseMock.mockRejectedValue(new Error("409 conflict"));
    const { wrapper } = mountForm();
    await fillMinimalValidForm(wrapper);

    await wrapper.find(".btn-primary").trigger("click");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(wrapper.find(".error-msg").text()).toBe("Speichern fehlgeschlagen — prüfe, ob der Name bereits vergeben ist.");
    expect(wrapper.emitted("created")).toBeUndefined();
    expect(wrapper.find(".btn-primary").text()).toBe("Übung speichern");
    expect(wrapper.find(".btn-primary").attributes("disabled")).toBeUndefined();
  });
});
