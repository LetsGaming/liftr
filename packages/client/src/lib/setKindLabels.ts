/** Single source of truth for a set kind's display name (the routine wizard's set-kind badge,
 *  WorkoutPage's set-row badge, and SetKindPicker.vue's option rows all import this, rather than
 *  each hand-writing the same four labels). Client-owned (unlike the `SetKind` type/slugs
 *  themselves, which stay in @liftr/shared for the server's routine zod schema) since display
 *  copy needs i18n, which shared code has no access to — same split as lib/tierIcons.ts's
 *  tierLabel(). */
import type { SetKind } from "@liftr/shared";
import { t } from "../i18n";

const SET_KIND_LABEL_KEY: Record<SetKind, string> = {
  warmup: "setKind.warmup",
  normal: "setKind.normal",
  failure: "setKind.failure",
  dropset: "setKind.dropset",
};

export function setKindLabel(kind: SetKind): string {
  return t(SET_KIND_LABEL_KEY[kind]);
}
