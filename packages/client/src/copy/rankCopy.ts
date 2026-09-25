import { t } from "../i18n";

/** Canonical wording for "what LP measures", shared by OverviewPage.vue and RanksPage.vue so
 *  both surfaces describe it identically. */
export function lpExplainer(): string {
  return t("rankCopy.lpExplainer");
}
