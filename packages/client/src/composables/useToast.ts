/**
 * Feature: "saving/updating settings has no feedback" — a minimal, dependency-free toast
 * queue. Module-level reactive state (not a Pinia store — this has no persistence/async-load
 * concerns a store exists for, just a shared reactive array every caller pushes onto) rendered
 * by ToastHost.vue, mounted once in App.vue alongside OnboardingGuide.
 */
import { reactive } from "vue";

export interface ToastMessage {
  id: number;
  text: string;
}

const toasts = reactive<ToastMessage[]>([]);
let nextId = 0;
const AUTO_DISMISS_MS = 2500;

export function useToast() {
  function toast(text: string) {
    const id = nextId++;
    toasts.push({ id, text });
    setTimeout(() => {
      const idx = toasts.findIndex((t) => t.id === id);
      if (idx !== -1) toasts.splice(idx, 1);
    }, AUTO_DISMISS_MS);
  }

  return { toast, toasts };
}
