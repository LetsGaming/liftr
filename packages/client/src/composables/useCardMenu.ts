/**
 * Per-card ⋮ menu open/close — one open id at a time, dismissed by an outside click or Escape.
 * Shared by RoutineList.vue (via useRoutineManagement, which layers routine-specific actions on
 * top) and RouteList.vue directly. The dismiss-on-outside-click check looks for `.card-menu-wrap`
 * (components/patterns/ListCard.vue's menu-slot wrapper, styled in styles/list-card.css) so clicks on
 * the trigger button or inside the open dropdown don't immediately close it.
 */
import { onUnmounted, ref } from "vue";

const MENU_WRAP_SELECTOR = ".card-menu-wrap";

export function useCardMenu() {
  const openMenuId = ref<string | null>(null);

  function toggleMenu(id: string) {
    openMenuId.value = openMenuId.value === id ? null : id;
  }

  function closeMenu() {
    openMenuId.value = null;
  }

  function onDocumentClick(event: MouseEvent) {
    if (openMenuId.value === null) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(MENU_WRAP_SELECTOR)) return;
    openMenuId.value = null;
  }

  function onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && openMenuId.value !== null) {
      openMenuId.value = null;
    }
  }

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
  onUnmounted(() => {
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onDocumentKeydown);
  });

  return { openMenuId, toggleMenu, closeMenu };
}
