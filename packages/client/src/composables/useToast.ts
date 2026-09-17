/**
 * A minimal, dependency-free toast queue, so saving/updating settings gives visible feedback.
 * Module-level reactive state (not a Pinia store — this has no persistence/async-load
 * concerns a store exists for, just a shared reactive array every caller pushes onto) rendered
 * by ToastHost.vue, mounted once in App.vue alongside OnboardingGuide.
 */
import { reactive } from "vue";

export interface ToastMessage {
  id: number;
  text: string;
  onClick?: () => void;
}

const toasts = reactive<ToastMessage[]>([]);
let nextId = 0;
const AUTO_DISMISS_MS = 2500;

export function useToast() {
  /** `onClick`, when given, makes the toast itself the action a notification implies (e.g.
   *  navigating to where the user actually needs to go) instead of just naming that action in text. */
  function toast(text: string, onClick?: () => void) {
    const id = nextId++;
    toasts.push({ id, text, onClick });
    setTimeout(() => {
      const idx = toasts.findIndex((t) => t.id === id);
      if (idx !== -1) toasts.splice(idx, 1);
    }, AUTO_DISMISS_MS);
  }

  function dismiss(id: number) {
    const idx = toasts.findIndex((t) => t.id === id);
    if (idx !== -1) toasts.splice(idx, 1);
  }

  return { toast, dismiss, toasts };
}
