/**
 * Haptic feedback wrapper (engagement rework W1). Thin layer over @capacitor/haptics — silent
 * no-op on web (the plugin itself no-ops there, this just avoids importing/calling into it on
 * platforms that can't vibrate) and under prefers-reduced-motion (a physical jolt is exactly
 * the kind of "motion" that preference is meant to suppress, even though it isn't visual).
 *
 * Three calls, matched to the three moments in the plan that earn a physical tap:
 *   tap()     — a set was logged (the 30x-per-session action)
 *   bump()    — an exercise was completed
 *   success() — a PR, rank-up, or workout finish
 */

/**
 * Foundation plan contract (2026-09-03): this is the app's ONLY haptic vocabulary. Every later
 * workstream's animated moment (Workstream A's set-logged/exercise-advance motion, Workstream
 * B's Finish Sequence beats and rank-up stamp) must map onto one of these three calls — no
 * workstream may introduce a fourth tier or call @capacitor/haptics directly. If a moment doesn't
 * clearly fit tap/bump/success, it does not get a haptic, per plan-c-new-ui-rebuild.md §2's
 * restraint stance (a gamification layer does not require constant physical feedback).
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canHaptic(): boolean {
  return Capacitor.isNativePlatform() && !prefersReducedMotion();
}

export const haptics = {
  async tap() {
    if (!canHaptic()) return;
    await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  async bump() {
    if (!canHaptic()) return;
    await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  },
  async success() {
    if (!canHaptic()) return;
    await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
};
