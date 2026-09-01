<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, RouterView, useRoute } from "vue-router";
import AuthGate from "./components/ui/AuthGate.vue";
import OnboardingGuide from "./components/ui/OnboardingGuide.vue";
import ToastHost from "./components/ui/ToastHost.vue";
import { useSettingsStore } from "./stores/settingsStore";
import { useStreakStore } from "./stores/streakStore";
import { useXpStore } from "./stores/xpStore";

const { t } = useI18n();
const streak = useStreakStore();
const xp = useXpStore();
const settingsStore = useSettingsStore();
onMounted(() => {
  void streak.load();
  void xp.load();
  void settingsStore.load();
});

/** Mount trigger and unmount trigger are deliberately different signals — see SheetModal.vue's
 *  header comment on why a modal must only ever unmount via its own `@close` (fired after
 *  Ionic's real dismiss teardown completes), never a v-if reacting straight to a data change.
 *  `needsOnboarding` flips to false the instant OnboardingGuide's own save() resolves — if this
 *  component's v-if depended on that directly, the sheet would get yanked out from under Ionic
 *  mid-dismiss the same way the routine wizard/workout-delete crash (fixed elsewhere) did. */
const showOnboarding = ref(false);
watch(
  () => settingsStore.needsOnboarding,
  (needs) => {
    if (needs) showOnboarding.value = true;
  },
);

/** The nav chips were dead text (engagement rework W6) — a streak that just grew gets one pulse
 *  on its flame, rather than looking identical whether it was extended a second ago or a week
 *  ago. Only fires on an actual increase (not the initial load, and not a decrease/reset). */
const streakJustExtended = ref(false);
watch(
  () => streak.streak,
  (next, prev) => {
    if (prev != null && next > prev) {
      streakJustExtended.value = false;
      requestAnimationFrame(() => {
        streakJustExtended.value = true;
        setTimeout(() => (streakJustExtended.value = false), 900);
      });
    }
  },
);

/**
 * Per-section coloured icons (UI/UX rework audit P0-E) — restored from the mockup's exact SVG
 * paths and per-section accent (home=blue-hi, workout=blue, ränge=gold, läufe=fire,
 * profil=violet), which the Ionic port dropped to text-only nav. `svg` is static, hand-authored
 * markup we control (never user input), so `v-html` here carries no injection risk.
 */
const navItems = [
  {
    to: "/",
    labelKey: "nav.overview",
    color: "var(--blue-hi)",
    svg: '<path d="M4 11l8-7 8 7M6 10v9h12v-9"/>',
  },
  {
    to: "/workout",
    labelKey: "nav.workout",
    color: "var(--blue)",
    svg: '<path d="M4 9v6M20 9v6M7 7v10M17 7v10M9 12h6"/>',
  },
  {
    to: "/ranks",
    labelKey: "nav.ranks",
    color: "var(--advanced-3)",
    svg: '<path d="M12 2l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 20.2 6.8 18l1-5.8L3.6 8.1l5.8-.8z"/>',
  },
  {
    to: "/exercises",
    labelKey: "nav.exercises",
    color: "var(--green)",
    svg: '<path d="M6 4v16M18 4v16M6 12h12"/><circle cx="6" cy="8" r="1.4" fill="currentColor" stroke="none"/><circle cx="6" cy="16" r="1.4" fill="currentColor" stroke="none"/>',
  },
  {
    to: "/runs",
    labelKey: "nav.runs",
    color: "var(--fire)",
    svg: '<circle cx="14" cy="5" r="1.6"/><path d="M8 9l3.5-1.2L14 10l3 1M6.5 21l3-5.5 3 1 1.2 4.5M11.5 13.5L9 18"/>',
  },
  {
    to: "/profile",
    labelKey: "nav.profile",
    color: "var(--violet)",
    svg: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" stroke-linecap="round"/>',
  },
] as const;

/**
 * Accessibility audit (P2): every page has a visible <IonTitle>, but ion-title renders as a
 * plain custom element with no heading role — screen-reader heading navigation never lands
 * anywhere. navItems' labels already track each page's real title, so reuse them for a
 * visually-hidden <h1> here rather than inventing per-page route-meta titles. Falls back to
 * the app name for routes not in navItems (e.g. /attributions).
 */
const route = useRoute();
const pageTitle = computed(() => {
  const match = navItems.find((item) => item.to === route.path);
  return match ? t(match.labelKey) : "Liftr";
});
</script>

<template>
  <AuthGate>
    <OnboardingGuide v-if="showOnboarding" @close="showOnboarding = false" />
    <ToastHost />
    <!-- Accessibility audit (P2): a real <h1> heading landmark for screen-reader heading
         navigation. Visually hidden — every page's <IonTitle> stays the only VISIBLE title;
         this exists purely so assistive tech has a landing point. Lives once here (not per-page)
         so it survives every route transition without duplication. -->
    <h1 class="sr-only">{{ pageTitle }}</h1>
    <div class="app-shell">
      <!-- desktop sidebar / mobile tab bar: one route set, two layouts (plan 1.2) -->
      <nav class="side-nav" aria-label="Hauptnavigation">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :style="{ '--nav-color': item.color }"
        >
          <!-- eslint-disable-next-line vue/no-v-html -- static, hand-authored SVG paths only, never user input, see header comment -->
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="item.svg" />
          {{ t(item.labelKey) }}
        </RouterLink>
        <div v-if="xp.showXp && xp.loaded" class="level-chip">
          <b>Lv. {{ xp.level }}</b>
          <div class="rankbar"><i class="bar-fill" :style="{ transform: `scaleX(${xp.progressPercent / 100})` }" /></div>
          <span class="xp-amount">✦ {{ xp.xpIntoLevel }}/{{ xp.xpForNextLevel }} bis Lv. {{ xp.level + 1 }}</span>
        </div>
        <div v-if="streak.loaded && streak.streak > 0" class="streak-chip" :class="{ 'streak-pulse': streakJustExtended }">
          🔥 {{ streak.streak }} Tage Serie
        </div>
      </nav>
      <main class="main-content">
        <!-- App.vue had no route transition at all — a hard cut between tabs (engagement
             rework W6). mode="out-in" so the incoming page doesn't overlap the outgoing one. -->
        <RouterView v-slot="{ Component }">
          <Transition name="route-fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
      <!-- level/streak chips live in .side-nav, which is hidden below 900px (plan 1.2) — without
           this mobile-only duplicate, level and streak were completely invisible on phone.

           .mobile-status and .tab-bar used to be two independently `position: fixed` elements,
           the chip floating free-standing ~62px above the tab bar. A live-viewport audit (P0)
           found the chip clipping real content (a stat tile on `/`, a rank card's exercise name,
           profile action buttons, an exercises list row) — and not just at the *end* of a page's
           scroll: on `/` it already clips the "Gesamtrang" tile at scrollTop 0, the very first
           view, with hundreds more px of content still below. ion-content's --padding-bottom
           (below in ionic-theme.css) only reserves clearance at the scroll *end*; it cannot
           rescue content that scrolls into the chip's fixed viewport band mid-page — that's true
           of any fixed overlay. On top of that, the chip's two pills floated with transparent
           gaps around/between them (no backdrop on the container itself), so scrolled text
           visibly poked through those gaps rather than disappearing behind one clean opaque
           edge — the "cuts off ... mid-word" look. And the chip's own rendered bottom already
           sank ~8.5px into the tab bar's top (two independently-positioned fixed elements with
           only an assumed, unenforced gap between them).
           Fix: stack both inside one `.bottom-chrome` flex column that's the *only* fixed
           element, given its own solid backdrop. That makes the whole band a single continuous
           opaque bar (no gaps content can peek through, no independent-offset drift), and lets
           ion-content's padding-bottom target one measured, robust height instead of guessing
           where a separately-fixed chip lands. -->
      <div class="bottom-chrome">
        <div v-if="(xp.showXp && xp.loaded) || (streak.loaded && streak.streak > 0)" class="mobile-status">
          <div v-if="xp.showXp && xp.loaded" class="level-chip mobile">
            <div class="mobile-level-row">
              <b>Lv. {{ xp.level }}</b>
              <span class="xp-amount">✦ {{ xp.xpIntoLevel }}/{{ xp.xpForNextLevel }} bis Lv. {{ xp.level + 1 }}</span>
            </div>
            <!-- .side-nav's chip has a progress bar (.rankbar); the mobile chip previously
                 dropped it entirely — level was visible on phone but progress toward the next
                 one wasn't. -->
            <div class="rankbar mobile-bar"><i class="bar-fill" :style="{ transform: `scaleX(${xp.progressPercent / 100})` }" /></div>
          </div>
          <div v-if="streak.loaded && streak.streak > 0" class="streak-chip mobile" :class="{ 'streak-pulse': streakJustExtended }">🔥 {{ streak.streak }}</div>
        </div>
        <nav class="tab-bar" aria-label="Hauptnavigation">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="tab-link"
            :style="{ '--nav-color': item.color }"
          >
            <!-- eslint-disable-next-line vue/no-v-html -- static, hand-authored SVG paths only, never user input, see header comment -->
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="item.svg" />
            {{ t(item.labelKey) }}
          </RouterLink>
        </nav>
      </div>
    </div>
  </AuthGate>
</template>

<style scoped>
/* Accessibility audit (P2) — standard visually-hidden pattern: present and readable to
   assistive tech (unlike display:none/visibility:hidden), invisible and takes no layout space
   for sighted users. No existing sr-only utility was found elsewhere in the codebase's CSS. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.app-shell {
  min-height: 100vh;
  display: flex;
}
.main-content {
  flex: 1;
  /* Ionic's .ion-page is position:absolute + inset:0 (it expects an ion-router-outlet
     ancestor) — without a positioned ancestor here it covers the entire viewport,
     hiding the side-nav/tab-bar. This scopes that absolute positioning to this pane
     instead, so plain (not-yet-migrated) pages and Ionic-migrated pages both work
     under the same router-outlet-free shell. */
  position: relative;
  padding: var(--sp6);
}
/* Route cross-fade (engagement rework W6) — was a hard cut between tabs since there's no
   ion-router-outlet here for Ionic's own page transitions to hook into (see the position:
   relative comment above). Each ion-page is already absolute+inset:0, so the two pages
   stacking during the fade doesn't shift layout. */
/* mode="out-in" runs leave then enter back-to-back, so the perceived duration is roughly double
   a single phase — --dur-slow (420ms/phase, ~840ms total) read as sluggish for something as
   frequent as a tab switch (feedback). --dur-fast keeps the cut from feeling instant/jarring
   without lingering. */
.route-fade-enter-active,
.route-fade-leave-active {
  transition: opacity var(--dur-fast) var(--ease-out);
}
.route-fade-enter-from,
.route-fade-leave-to {
  opacity: 0;
}
.side-nav {
  display: none;
  flex-direction: column;
  gap: 4px;
  width: 224px;
  border-right: 1px solid var(--line);
  padding: var(--sp4) var(--sp3);
}
.bottom-chrome {
  display: none;
}
.tab-bar {
  display: flex;
  justify-content: space-around;
  background: var(--surface);
  border-top: 1px solid var(--line);
  padding: 9px 2px calc(env(safe-area-inset-bottom, 0px) + 12px);
}
.nav-link {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  color: var(--dim);
  text-decoration: none;
  padding: var(--sp2) var(--sp3);
  border-radius: var(--r-sm);
  font-weight: 600;
  font-size: 13.5px;
}
.tab-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: var(--faint);
  text-decoration: none;
  padding: 4px 3px;
  border-radius: var(--r-sm);
  font-weight: 700;
  /* Was 10px (9px below 380px) — a live audit measured every bottom-nav label below the 11px
     readable-text floor on all 6 routes. Bumped both sizes; icons shrink instead below 380px
     to keep 6 items fitting without wrapping/clipping (verified at 360px and 390px). */
  font-size: 11.5px;
  white-space: nowrap;
}
/* 6 items now (was 5) — a bit more breathing room needed below 380px. */
@media (max-width: 380px) {
  .tab-link {
    font-size: 10.5px;
  }
  .tab-link .nav-icon {
    width: 18px;
    height: 18px;
  }
}
/* Reflow audit (P1, WCAG 1.4.10): at extreme zoom-equivalent widths (measured 195px, the
   standard 400% "reflow" test point derived from 390px @ 200%) six items no longer fit even at
   the shrunk 380px sizing above — "Läufe" and "Profil" clipped off the right edge of this
   `position: fixed` bar with no way to reach them (page-level scroll doesn't reach a fixed
   element). Below 300px (well under any real layout — 360/390px devices never hit this), let the
   bar scroll horizontally instead of clipping: `flex: none` stops items shrinking to 0 so they
   stay tappable, `justify-content: flex-start` avoids space-around fighting the scroll, and the
   scrollbar is hidden (still touch/wheel scrollable) so it doesn't eat into the already-tight
   9px vertical padding. */
@media (max-width: 300px) {
  .tab-bar {
    justify-content: flex-start;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .tab-bar::-webkit-scrollbar {
    display: none;
  }
  .tab-link {
    flex: none;
    padding-left: 8px;
    padding-right: 8px;
  }
}
.nav-icon {
  width: 20px;
  height: 20px;
  flex: none;
}
.tab-link .nav-icon {
  width: 23px;
  height: 23px;
}
.nav-link.router-link-active,
.tab-link.router-link-active {
  color: var(--text);
}
.nav-link.router-link-active {
  background: var(--surface-2);
}
.nav-link.router-link-active .nav-icon,
.tab-link.router-link-active .nav-icon {
  color: var(--nav-color);
}
.streak-chip {
  margin-top: auto;
  padding: var(--sp2) var(--sp3);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--fire-hi);
  background: var(--surface-2);
  border-radius: var(--r-sm);
}
/* One-shot pulse the moment the streak actually grows (engagement rework W6) — was dead text
   regardless of whether it just changed or has looked the same for a week. */
.streak-pulse {
  animation: streak-pulse var(--dur-cele) var(--ease-spring);
}
@keyframes streak-pulse {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.12);
    color: var(--fire);
  }
  100% {
    transform: scale(1);
  }
}
.level-chip {
  margin-top: auto;
  padding: var(--sp2) var(--sp3);
  background: var(--surface-2);
  border-radius: var(--r-sm);
  font-size: 12.5px;
}
.level-chip b {
  display: block;
  margin-bottom: 4px;
}
.level-chip .rankbar {
  height: 6px;
}
.level-chip .xp-amount {
  display: block;
  margin-top: 4px;
  color: var(--blue-hi);
  font-weight: 700;
  font-size: 11.5px;
}
.level-chip + .streak-chip {
  margin-top: var(--sp2);
}

@media (min-width: 900px) {
  .side-nav {
    display: flex;
  }
  .main-content {
    padding-bottom: var(--sp6);
  }
}
@media (max-width: 899px) {
  .main-content {
    /* Note: every routed page renders an Ionic <IonPage>, which is position:absolute + inset:0
       — it fills .main-content's full border box and completely ignores this padding (abs-
       positioned children aren't constrained by an ancestor's padding). This only matters for
       non-Ionic content directly inside .main-content, if any is ever added; the real bottom-
       clearance fix for Ionic pages is ion-content's --padding-bottom in ionic-theme.css. */
    padding-bottom: 80px;
  }
  /* Single fixed element for the whole bottom chrome (status row + tab bar stacked in one flex
     column) — see the P0 fix comment above the template markup for why this replaced two
     independently `position: fixed` pieces. Because .mobile-status is now laid out in normal
     flow *inside* this column (not fixed/floating), it can never land on top of scrolled page
     content: it always occupies exactly its own row, directly above the tab bar, with a solid
     shared backdrop and zero gap between them. */
  .bottom-chrome {
    display: flex;
    flex-direction: column;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .mobile-status {
    display: flex;
    justify-content: center;
    gap: var(--sp2);
    padding: 8px var(--sp3) 6px;
  }
  .mobile-status .level-chip,
  .mobile-status .streak-chip {
    margin-top: 0;
    padding: 4px var(--sp3);
  }
  .mobile-status .level-chip b {
    display: inline;
    margin-bottom: 0;
  }
  .mobile-level-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .mobile-status .level-chip .xp-amount {
    display: inline;
    margin-top: 0;
  }
  .mobile-bar {
    width: 64px;
    height: 5px;
    margin-top: 3px;
  }
  .mobile-status .level-chip + .streak-chip {
    margin-top: 0;
  }
}
</style>
