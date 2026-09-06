<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, RouterView, useRoute } from "vue-router";
import AuthGate from "./components/ui/AuthGate.vue";
import OnboardingGuide from "./components/ui/OnboardingGuide.vue";
import ToastHost from "./components/ui/ToastHost.vue";
import { showingFinishRecap } from "./composables/useWorkoutChrome";
import { useActiveWorkoutStore } from "./stores/activeWorkoutStore";
import { useOverallRankStore } from "./stores/overallRankStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useStreakStore } from "./stores/streakStore";
import { useXpStore } from "./stores/xpStore";

const { t } = useI18n();
const streak = useStreakStore();
const xp = useXpStore();
const settingsStore = useSettingsStore();
const overallRank = useOverallRankStore();
const activeWorkout = useActiveWorkoutStore();
onMounted(() => {
  void streak.load();
  void xp.load();
  void settingsStore.load();
  void overallRank.load();
});

/** Rework Phase 2: the 9-tier ladder used to reach exactly one tab (RanksPage) — everywhere
 *  else in the app had no idea what tier the user is. Setting the tier class at the shell lets
 *  --tier-accent/--tier-deep (tokens.css) cascade down to the level bar, active nav indicator,
 *  and log-set focus ring without each of them needing its own rank lookup. Falls back to no
 *  class (tokens.css's own var() fallbacks take over) before the first load resolves or offline
 *  with nothing cached. */
const overallTierClass = computed(() =>
  overallRank.current ? `t-${overallRank.current.tier}` : "",
);

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
  if (match) return t(match.labelKey);
  // Phase 2 (engagement-audit-v3): /runs dropped out of navItems when Läufe merged into the
  // Workout tab (see the in-page switcher on WorkoutPage.vue/RunsPage.vue), but the route itself
  // is unchanged and still needs a real heading here, not the "Liftr" fallback.
  if (route.path === "/runs") return t("nav.runs");
  // UI audit fix (2026-09-06): these two routes are drill-ins with no navItems entry (same
  // reason /runs needed its own case above) — previously silently fell through to "Liftr" here.
  if (route.name === "records") return "Rekorde";
  if (route.name === "attributions") return "Quellen & Lizenzen";
  return "Liftr";
});

/**
 * Audit fix (workplan-v1 §1.4/§1.5, fixed together since both gate the same condition): the
 * top-hud level/streak chips used to render unconditionally everywhere. §1.4 — they duplicated
 * the same Lv./XP number FinishSequence's own "Fortschritt" beat shows, with no visual link
 * between the two. §1.5 — they also competed for space on the active-logging screen, the app's
 * lowest-density-tolerance surface. Scoped to the Workout tab only; every other screen keeps the
 * chips exactly as before — the "ambient reminder" effect they buy is only being traded away
 * where a real cost was found, not everywhere.
 */
const hideTopHud = computed(
  () => route.path === "/workout" && (activeWorkout.isActive || showingFinishRecap.value),
);

/**
 * UI audit fix: /records (RecordsPage.vue's "Rang-Analyse" screen) isn't in navItems at all — it
 * lives behind the "Ränge" tab as a drill-in, not its own tab. RouterLink's automatic
 * router-link-active only matches on the routes it was actually given (/ranks), so navigating
 * into /records left every tab looking unselected, not "Ränge" as the parent-ish section still
 * showing active. No central route-to-tab map exists to patch (navItems is the only route list),
 * so this is a targeted override for the one known case rather than a generic ancestor-route
 * lookup.
 *
 * UI audit fix (2026-09-06): two more of the same class of bug, found live — /runs (the "Läufe"
 * switcher tab on WorkoutPage.vue/RunsPage.vue) isn't in navItems either (it merged into the
 * Workout tab's in-page switcher, per the /runs case in pageTitle above, but the route itself is
 * still a separate path RouterLink's own active-matching never sees), and /routines/:id (the new
 * Routine Overview drill-in) is reached from a routine card on Übersicht/Workout, so it belongs
 * to "Workout" the same way /records belongs to "Ränge". */
const forceActiveTo = computed(() => {
  if (route.name === "records") return "/ranks";
  if (route.name === "runs" || route.name === "routine-overview") return "/workout";
  return null;
});
</script>

<template>
  <AuthGate>
    <OnboardingGuide v-if="showOnboarding" @close="showOnboarding = false" />
    <ToastHost />
    <!-- Accessibility audit (P2): a real <h1> heading landmark for screen-reader heading
         navigation. Visually hidden. 2026-09-06 (top-hud redesign, direction C): each page's own
         <IonTitle> is now ALSO hidden globally (ionic-theme.css) — the mobile header row became a
         level/streak status readout instead of a title bar (see .top-hud below), so this sr-only
         heading is the page's ONLY title anywhere right now, sighted or not. Lives once here (not
         per-page) so it survives every route transition without duplication. -->
    <h1 class="sr-only">{{ pageTitle }}</h1>
    <div class="app-shell" :class="overallTierClass">
      <!-- Persistent top HUD (rework Phase 4). Was a full-width strip floating above every page's
           header, then (2026-09-06 first pass) a trailing chip overlaid top-right on the toolbar
           — both read as bolted-on per PO feedback ("looks like a bug, feels cheap, rethink
           entirely"). Direction C (brainstormed with visual mockups, chosen over a nav-icon badge
           and a floating corner pill): the header row itself BECOMES the status readout instead
           of carrying a page title — a small XP-progress ring with the level number inside, plus
           streak, spanning the toolbar's full width now that ion-title is hidden globally
           (ionic-theme.css) and each page's real title lives only in the sr-only <h1> above. No
           title text is shown anywhere sighted on mobile — the bottom tab bar's own labels
           already say which screen you're on. Mobile only — >=900px still shows the fuller
           level/streak chips (with the XP-amount text this compact ring deliberately drops) in
           .side-nav. Still hidden on the Workout tab while a set is being logged (hideTopHud,
           unchanged) — the header reads as intentionally quiet there, consistent with everything
           else decluttered on that screen this session, rather than falling back to a title. -->
      <div v-if="!hideTopHud && ((xp.showXp && xp.loaded) || (streak.loaded && streak.streak > 0))" class="top-hud">
        <div
          v-if="xp.showXp && xp.loaded"
          class="level-ring"
          :style="{ '--progress': xp.progressPercent }"
          role="img"
          :aria-label="`Level ${xp.level}, ${xp.xpIntoLevel} von ${xp.xpForNextLevel} XP bis Level ${xp.level + 1}`"
        >
          <span>{{ xp.level }}</span>
        </div>
        <div v-if="streak.loaded && streak.streak > 0" class="streak-chip mobile" :class="{ 'streak-pulse': streakJustExtended }">🔥 {{ streak.streak }}</div>
      </div>
      <!-- desktop sidebar / mobile tab bar: one route set, two layouts (plan 1.2) -->
      <nav class="side-nav" aria-label="Hauptnavigation">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ 'router-link-active': item.to === forceActiveTo }"
          :style="{ '--nav-color': item.color }"
        >
          <!-- eslint-disable-next-line vue/no-v-html -- static, hand-authored SVG paths only, never user input, see header comment -->
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="item.svg" />
          {{ t(item.labelKey) }}
        </RouterLink>
        <div v-if="xp.showXp && xp.loaded" class="level-chip">
          <span class="level-dot" aria-hidden="true"></span>
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
      <!-- Now just the tab bar — the level/streak status row that used to stack above it moved
           to .top-hud (see the comment up top explaining why, and preserving the same "one
           fixed element, one solid backdrop" discipline the original P0 fix established). Kept
           as its own fixed element (not folded into .top-hud) since it's still the primary
           navigation surface, needed even when there's no XP/streak to show. -->
      <div class="bottom-chrome">
        <nav class="tab-bar" aria-label="Hauptnavigation">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="tab-link"
            :class="{ 'router-link-active': item.to === forceActiveTo }"
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
/* Nebula Foundation F5 — nav hybrid (complete-redesign spec §3.5). Translucent + blurred, same
   tokens as every other hybrid surface, so the sweep bleeds through subtly instead of the nav
   reading as opaque chrome floating on top of the scene. Kept the existing solid border-right
   (rather than F3's full mask-composite ring) since a ring reads oddly on a straight edge-to-
   edge bar with no rounded corners — translucency+blur is what "hybrid" buys a full-bleed nav,
   the ring is specifically a card/panel affordance. See the F5 regression-check comment on
   .bottom-chrome below for the live clipping/legibility re-verification this required. */
.side-nav {
  display: none;
  flex-direction: column;
  gap: 4px;
  width: 224px;
  background: var(--surface-hybrid-bg);
  backdrop-filter: blur(var(--surface-hybrid-blur));
  -webkit-backdrop-filter: blur(var(--surface-hybrid-blur));
  border-right: 1px solid var(--line);
  padding: var(--sp4) var(--sp3);
}
.bottom-chrome {
  display: none;
}
/* Mobile-only (>=900px shows the same level/streak chips in .side-nav instead) — hidden by
   default, shown in the max-width:899px query below. */
.top-hud {
  display: none;
}
.tab-bar {
  display: flex;
  justify-content: space-around;
  /* F5: .tab-bar and its fixed ancestor .bottom-chrome (below) independently painted
     var(--surface) — both switched to the hybrid fill together so there's no opaque layer
     hiding behind the translucent one. */
  background: var(--surface-hybrid-bg);
  border-top: 1px solid var(--line);
  /* Vertical padding moved onto .tab-link itself (was here) so an active tab's fill block can
     reach the bar's full height edge-to-edge (0a's active-tab redesign, see .tab-link.router-
     link-active below) — .tab-bar only keeps the safe-area clearance, which sits below the
     visible bar and has nothing to fill anyway. */
  padding: 0 2px env(safe-area-inset-bottom, 0px);
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
  min-height: var(--touch-target-min);
}
.tab-link {
  /* Bug fix (PO: "nav button highlight is still not fixed, especially on mobile"): this was
     content-sized (`.tab-bar`'s `justify-content: space-around` only spaces gaps evenly, it
     doesn't equalize width), so five tabs rendered five different widths (measured 56/51/37/51/
     33px live) and the "whole tab cell" active-fill below (0a's redesign) filled a different,
     oddly-shaped box per tab instead of a uniform column. flex: 1 makes every tab an equal-width
     column edge-to-edge, matching the equal-width fix already applied to WorkoutRunsSwitcher.vue
     and ExerciseInfoPanel.vue's tab strip for the same complaint. */
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  /* Was --faint — desktop's .nav-link rested at --dim for no stated reason, so the two nav
     surfaces had different resting label colors (critique finding). --dim also has more
     contrast, which matters more here since the label is smaller (11.5px vs 13.5px). */
  color: var(--dim);
  text-decoration: none;
  padding: 9px 3px 12px;
  border-radius: var(--r-sm);
  font-weight: 700;
  /* Was 10px (9px below 380px) — a live audit measured every bottom-nav label below the 11px
     readable-text floor on all 6 routes. Bumped both sizes; icons shrink instead below 380px
     to keep 6 items fitting without wrapping/clipping (verified at 360px and 390px). */
  font-size: 11.5px;
  white-space: nowrap;
  min-height: var(--touch-target-min);
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
/* 0a's Liftoff tab-bar finding (engagement-audit-v3 Phase 1, resolved decision — see the
   doc's "Decisions already made" #... section): icons stay full-colour ALWAYS, at rest and
   active alike. The prior session's dimmed-at-rest/full-on-active treatment (opacity 0.55->1)
   is gone; recognisability now comes from the icon's own permanent section color, and "active"
   is signalled by the surrounding block instead of the icon changing at all. */
.nav-icon {
  width: 20px;
  height: 20px;
  flex: none;
  color: var(--nav-color);
}
.tab-link .nav-icon {
  width: 23px;
  height: 23px;
}
/* Active-tab treatment, redesigned per 0a (replacing the prior session's color-mix tinted
   background on desktop and 2px inset bottom underline on mobile — both read as "cheap" per the
   user's own critique). Liftoff's actual pattern, matched here exactly rather than tweaked:
   a filled rectangular block covering the WHOLE tab cell (mobile: the full tab-bar height too,
   via .tab-bar's default flex `align-items: stretch` making .tab-link already fill that height —
   no extra sizing needed) at one surface-lightness step up, a 2px accent rule across the block's
   TOP edge only, and the label going grey -> white. Square corners (border-radius: 0 overrides
   the resting .nav-link/.tab-link radius), no pill, no glow, no scale, no icon recolor. */
.nav-link.router-link-active,
.tab-link.router-link-active {
  background: var(--surface-2);
  border-radius: 0;
  box-shadow: inset 0 2px 0 var(--tier-accent, var(--nebula-1));
}
.nav-link.router-link-active,
.tab-link.router-link-active {
  color: var(--text);
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
/* F6 (Nebula Foundation light-mode contrast pass) — found by the required automated audit
   (Lighthouse/axe color-contrast), pre-existing and unrelated to the sweep/hybrid surfaces this
   task otherwise targets, but caught here because it lives in App.vue, which no later phase in
   this plan ever touches again (see the plan's file-boundary table) — leaving it would orphan a
   known AA failure permanently. --fire-hi/--surface-2 measured at 1.82:1 in light mode (need
   4.5:1); mechanically darkened via color-mix rather than inventing a new brand hex (measured
   ~5.3:1 against --surface-2 light). --blue-hi/--surface-2 similarly measured at 2.38:1;
   --blue-lo is an existing token already used elsewhere for "the darker blue" and measures
   ~5.25:1 here. OverviewPage.vue's two separate eyebrow-color contrast failures found by the
   same audit are NOT fixed here — that file is owned by Wave 0-B/N1, not Foundation. */
:root[data-theme="light"] .streak-chip {
  color: color-mix(in srgb, var(--fire-hi) 55%, black);
}
/* One-shot pulse the moment the streak actually grows (engagement rework W6) — was dead text
   regardless of whether it just changed or has looked the same for a week. */
.streak-pulse {
  animation: streak-pulse var(--dur-cele) var(--ease-spring);
  box-shadow: 0 0 0 1px var(--nebula-glow), 0 8px 20px -8px var(--nebula-glow-strong);
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
.level-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nebula-grad);
  margin-right: 4px;
  vertical-align: middle;
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
/* F6 — see the .streak-chip light-mode override above for the full rationale; same audit finding
   (--blue-hi/--surface-2 measured 2.38:1 in light mode), same fix approach (reuse an existing
   token rather than inventing a color: --blue-lo measures ~5.25:1 here). */
:root[data-theme="light"] .xp-amount {
  color: var(--blue-lo);
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
  /* --top-hud-h lives on .app-shell (the nearest ancestor .top-hud and .main-content actually
     share) rather than on .top-hud itself — custom properties only inherit down the DOM tree,
     and .top-hud/.main-content are siblings, not ancestor/descendant. Declaring it on .top-hud
     "worked" in the sense that .top-hud could read its own property back, but .main-content's
     var(--top-hud-h, 0px) always resolved to the 0px fallback, so .main-content never actually
     moved — real content silently rendered underneath the fixed HUD. Caught by measuring the
     live layout (getBoundingClientRect), not by reading the CSS. */
  .app-shell {
    /* UI audit fix: was calc(52px + safe-area) to reserve a whole separate band above every
       page's header for the old full-width .top-hud strip. Now that the HUD overlays the header
       itself (see .top-hud below) instead of pushing content down, no extra clearance is needed
       here — .main-content still reads this var (0px = no-op) so nothing else has to change. */
    --top-hud-h: 0px;
    /* Foundation Task 2 (2026-09-03 plan) — needed so any fixed-position element can know how
       much space the fixed .bottom-chrome tab bar reserves at the bottom of the viewport, the
       same way .main-content already needs --top-hud-h for the top. Measured content height is
       ~55-61px depending on the <380px icon/font shrink breakpoint (9px+ icon(18-23px)+3px
       gap+label line(~13-14px)+12px, see .tab-link above) — 64px is a deliberate small margin
       over the tallest measured case, not a re-measurement per breakpoint, since consumers only
       need "enough clearance," not pixel-exact clearance. */
    --bottom-chrome-h: calc(64px + env(safe-area-inset-bottom, 0px));
  }
  .main-content {
    /* Note: every routed page renders an Ionic <IonPage>, which is position:absolute + inset:0
       — it fills .main-content's full border box and completely ignores this padding (abs-
       positioned children aren't constrained by an ancestor's padding). This only matters for
       non-Ionic content directly inside .main-content, if any is ever added; the real bottom-
       clearance fix for Ionic pages is ion-content's --padding-bottom in ionic-theme.css. */
    padding-bottom: 80px;
    /* Unlike padding, `margin-top` on the *positioned ancestor itself* does shift where an
       inset:0 child's box starts — .main-content has `position: relative` above, so ion-page's
       inset:0 is relative to *this* box, and moving this box down moves ion-page (header +
       content, as one unit) down with it. This is how .top-hud (below) gets clearance without
       needing to reach into every page's ion-content shadow DOM the way --padding-bottom does
       for the tab bar. */
    margin-top: var(--top-hud-h, 0px);
  }
  /* Persistent top HUD (rework Phase 4) — UI audit fix (2026-09-06, first pass, see the template
     comment above for the full rationale): was a full-width, borderless bar floating in its own
     reserved band above every page's IonHeader/IonToolbar, reading as an unstyled rendering glitch
     rather than an intentional element. Now a small trailing chip overlaid top-right ON TOP of
     that toolbar (every page shares the identical header skeleton — see ionic-theme.css's
     ion-toolbar rule for its height/background) instead of a separate strip: no reserved
     clearance needed (--top-hud-h is 0 above), just a fixed overlay positioned within the header's
     own vertical band. IonTitle is centered with nothing docked to its trailing edge on any of
     these pages, so this doesn't collide with any existing header content at the widths tested
     (360-430px). Left deliberately simple (one line, no XP bar/streak-day label) per the "compact
     trailing element, first reasonable pass" scope — further visual iteration (matching the
     toolbar's exact hybrid fill/edge treatment, tap target to open a details sheet, etc.) is
     expected in a follow-up pass with the product owner, not attempted here. */
  .top-hud {
    display: flex;
    align-items: center;
    /* Was gap:6px + right:var(--sp3) (a trailing chip pair). Direction C spans the whole toolbar
       now that no title shares the row with it, ring on the left edge, streak on the right — the
       same "level first, streak second" reading order the fuller side-nav chips already use. */
    justify-content: space-between;
    position: fixed;
    top: env(safe-area-inset-top, 0px);
    left: 0;
    right: 0;
    height: 52px;
    padding: 0 var(--sp4);
    z-index: 5;
    /* The ring/streak are the only interactive-looking pieces; nothing else lives in this band
       (the title is gone) so there's no content underneath a click here could ever need to reach
       — but pointer-events stays default (auto) rather than none-with-children-auto, since that
       extra indirection isn't buying anything real here. */
  }
  .top-hud .streak-chip {
    margin-top: 0;
    padding: 5px 10px;
    font-size: 12.5px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* The XP-progress ring — level number centered inside a conic-gradient ring sized to
     xp.progressPercent (0-100 -> 0-360deg). Deliberately compact/quiet: this replaces a title,
     it shouldn't out-shout one. --nebula-1 (not the full 3-stop --nebula-grad) for the same
     "restrained, precise glow, never a bloom" discipline the rest of this redesign holds to —
     a full brand gradient spinning around a tiny ring read as busier in testing than a single
     hue. The unfilled remainder uses --line-2 (an existing neutral token) rather than a new one. */
  .level-ring {
    --progress: 0;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: conic-gradient(var(--nebula-1) calc(var(--progress) * 3.6deg), var(--line-2) 0);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .level-ring span {
    width: 23px;
    height: 23px;
    border-radius: 50%;
    /* --surface-2, not --bg — matches the streak-chip sitting right next to it (same token,
       tokens.css), so the ring's punched-out center and the streak pill read as one consistent
       surface family rather than the ring poking through to a visually different color. */
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text);
    font-weight: 800;
    font-size: 11px;
  }
  /* Single fixed element for the tab bar — see the P0 fix comment above the template markup for
     the history here (it used to also carry the status row now in .top-hud).

     F5 regression check (2026-09-05): this bar's own opacity was never what the P0 clipping fix
     depended on — that bug (content rendering unreachable behind the fixed bar) was fixed
     structurally via ion-content's --padding-bottom (ionic-theme.css) and .main-content's
     reserved --bottom-chrome-h, both independent of this element's background. Re-verified live
     with the same technique already used to clear .top-hud (Playwright scroll-to-end +
     elementFromPoint hit-testing along the bar's midline) after switching to the translucent
     fill below: on all 8 routes at 390px, the last content element still fully clears the bar at
     scroll end, and elementFromPoint at the bar's midline mid-scroll still resolves to the bar
     itself (or its children), never to content rendering through/behind it. Legibility (the
     other real risk — text sitting on the sweep bleeding through a translucent, 100%-of-the-
     time-visible bar) was also checked live and read clearly in both themes, so this stays
     translucent per the spec's default rather than being reverted to opaque. */
  .bottom-chrome {
    display: flex;
    flex-direction: column;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    background: var(--surface-hybrid-bg);
    backdrop-filter: blur(var(--surface-hybrid-blur));
    -webkit-backdrop-filter: blur(var(--surface-hybrid-blur));
    box-shadow: var(--surface-hybrid-shadow);
  }
}
</style>
