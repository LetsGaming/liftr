/**
 * Haptic feedback wrapper. Thin layer over @capacitor/haptics — silent no-op on web (the plugin
 * itself no-ops there, this just avoids importing/calling into it on platforms that can't
 * vibrate) and under prefers-reduced-motion (a physical jolt is exactly the kind of "motion"
 * that preference is meant to suppress, even though it isn't visual).
 *
 * Three calls, matched to the moments that earn a physical tap:
 *   tap()     — a set was logged (the 30x-per-session action)
 *   bump()    — an exercise was completed
 *   success() — a PR, rank-up, or workout finish
 */

/**
 * This is the app's only haptic vocabulary — every animated moment elsewhere in the app should
 * map onto one of these three calls rather than calling @capacitor/haptics directly or adding a
 * fourth tier. A moment that doesn't clearly fit tap/bump/success gets no haptic: a gamification
 * layer doesn't need constant physical feedback.
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
