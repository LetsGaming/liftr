/**
 * The single source of truth for "is this running inside the native (Capacitor) app shell, not a
 * browser?" — every feature that only works natively (Health Connect, local notifications,
 * haptics, background sync triggers) should check through here instead of calling
 * Capacitor.isNativePlatform()/getPlatform() directly, so there's one place enforcing consistency.
 */
import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Narrower than isNative() — Health Connect exists on Android only, not iOS or web. */
export function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
