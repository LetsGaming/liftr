// Extracted from RunsPage.vue's submitManual() so the manual-run-entry validation rules can be
// unit-tested without mounting the component (<script setup> doesn't expose named exports, so
// this can't live inline in the .vue file). Keep this in sync with what submitManual() actually
// sends: distance/minutes are the raw text-input strings (German-locale comma decimals allowed),
// date is the value of an <input type="date"> (expected "YYYY-MM-DD").
import { t } from "../i18n";

// Returns the first validation error message (translated via i18n.ts's t(), to match the rest of
// the page's copy), or null when the entry is valid. Deliberately checks the date BEFORE any
// `new Date(...)` call that could throw a raw RangeError — see submitManual()'s "T12:00:00" +
// toISOString() call, which is exactly what used to leak that RangeError to the UI.
export function validateManualEntry(distanceKm: string, minutes: string, date: string): string | null {
  const km = Number(distanceKm.replace(",", "."));
  if (!distanceKm.trim() || !Number.isFinite(km) || km <= 0) {
    return t("runValidation.distanceRequired");
  }

  const min = Number(minutes.replace(",", "."));
  if (!minutes.trim() || !Number.isFinite(min) || min <= 0) {
    return t("runValidation.durationRequired");
  }

  if (!date.trim() || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) {
    return t("runValidation.dateRequired");
  }

  return null;
}
