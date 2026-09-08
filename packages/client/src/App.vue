<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, RouterView, useRoute } from "vue-router";
import AppIcon from "./components/ui/AppIcon.vue";
import AuthGate from "./components/ui/AuthGate.vue";
import OnboardingGuide from "./components/ui/OnboardingGuide.vue";
import ToastHost from "./components/ui/ToastHost.vue";
import { showingFinishRecap } from "./composables/useWorkoutChrome";
import { useActiveWorkoutStore } from "./stores/activeWorkoutStore";
import { useOverallRankStore } from "./stores/overallRankStore";
import { useRoutineStore } from "./stores/routineStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useStreakStore } from "./stores/streakStore";
import { useXpStore } from "./stores/xpStore";

const { t } = useI18n();
const routineStore = useRoutineStore();
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

/** Setting the tier class at the shell lets --tier-accent/--tier-deep (tokens.css) cascade down
 *  to the level bar, active nav indicator, and log-set focus ring without each of them needing
 *  its own rank lookup. Falls back to no class (tokens.css's own var() fallbacks take over)
 *  before the first load resolves or offline with nothing cached. */
const overallTierClass = computed(() =>
  overallRank.current ? `t-${overallRank.current.tier}` : "",
);

/** Mount trigger and unmount trigger are deliberately different signals — see SheetModal.vue's
 *  header comment on why a modal must only ever unmount via its own `@close` (fired after
 *  Ionic's real dismiss teardown completes), never a v-if reacting straight to a data change.
 *  `needsOnboarding` flips to false the instant OnboardingGuide's own save() resolves — if this
 *  component's v-if depended on that directly, the sheet would get yanked out from under Ionic
 *  mid-dismiss. */
const showOnboarding = ref(false);
watch(
  () => settingsStore.needsOnboarding,
  (needs) => {
    if (needs) showOnboarding.value = true;
  },
);

/** A streak that just grew gets one pulse on its flame, rather than looking identical whether
 *  it was extended a second ago or a week ago. Only fires on an actual increase (not the
 *  initial load, and not a decrease/reset). */
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
 * Per-section coloured icons with a per-section accent (home=blue-hi, workout=blue, ränge=gold,
 * läufe=fire, profil=violet). `svg` is static, hand-authored markup we control (never user
 * input), so `v-html` here carries no injection risk.
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
 * Every page has a visible <IonTitle>, but ion-title renders as a plain custom element with no
 * heading role — screen-reader heading navigation never lands anywhere. navItems' labels
 * already track each page's real title, so reuse them for a visually-hidden <h1> here rather
 * than inventing per-page route-meta titles. Falls back to the app name for routes not in
 * navItems (e.g. /attributions).
 */
const route = useRoute();
const pageTitle = computed(() => {
  const match = navItems.find((item) => item.to === route.path);
  if (match) return t(match.labelKey);
  // /runs dropped out of navItems when Läufe merged into the Workout tab's in-page switcher
  // (WorkoutPage.vue/RunsPage.vue), but the route itself is unchanged and still needs a real
  // heading here, not the "Liftr" fallback.
  if (route.path === "/runs") return t("nav.runs");
  // These two routes are drill-ins with no navItems entry, same reason /runs needs its own
  // case above — otherwise they'd silently fall through to "Liftr".
  if (route.name === "records") return "Rekorde";
  if (route.name === "attributions") return "Quellen & Lizenzen";
  if (route.name === "routine-overview") {
    const routine = routineStore.byId(route.params.id as string);
    return routine ? routine.name : "Routine";
  }
  return "Liftr";
});

/**
 * The top-hud level/streak chips are hidden on the Workout tab while a set is active or the
 * finish recap is showing: they'd duplicate the same Lv./XP number FinishSequence's own
 * "Fortschritt" beat shows, and compete for space on the app's lowest-density-tolerance screen.
 * Every other screen keeps the chips as an ambient reminder.
 */
const hideTopHud = computed(
  () => route.path === "/workout" && (activeWorkout.isActive || showingFinishRecap.value),
);

/**
 * /records (RecordsPage.vue's "Rang-Analyse" screen) isn't in navItems at all — it lives behind
 * the "Ränge" tab as a drill-in, not its own tab. RouterLink's automatic router-link-active only
 * matches on the routes it was actually given (/ranks), so navigating into /records would leave
 * every tab looking unselected instead of "Ränge" showing active as the parent section. No
 * central route-to-tab map exists to patch (navItems is the only route list), so this is a
 * targeted override rather than a generic ancestor-route lookup.
 *
 * Same reasoning applies to /runs (merged into the Workout tab's in-page switcher, per the
 * /runs case in pageTitle above, but still a separate path RouterLink's active-matching never
 * sees) and /routines/:id (the Routine Overview drill-in, reached from a routine card on
 * Übersicht/Workout, belonging to "Workout" the same way /records belongs to "Ränge"). */
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
    <!-- Real <h1> heading landmark for screen-reader heading navigation. Visually hidden.
         Each page's own <IonTitle> is hidden globally (ionic-theme.css) — the mobile header row
         is a level/streak status readout instead of a title bar (see .top-hud below), so this
         sr-only heading is the page's only title anywhere, sighted or not. Lives once here (not
         per-page) so it survives every route transition without duplication. -->
    <h1 class="sr-only">{{ pageTitle }}</h1>
    <div class="app-shell" :class="overallTierClass">
      <!-- The header row itself is the status readout instead of carrying a page title — a
           small XP-progress ring with the level number inside, plus streak, spanning the
           toolbar's full width now that ion-title is hidden globally (ionic-theme.css) and each
           page's real title lives only in the sr-only <h1> above. Mobile only — >=900px shows
           the fuller level/streak chips (with the XP-amount text this compact ring drops) in
           .side-nav instead. Hidden on the Workout tab while a set is being logged (hideTopHud). -->
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
        <div v-if="streak.loaded && streak.streak > 0" class="streak-chip mobile" :class="{ 'streak-pulse': streakJustExtended }">
          <AppIcon name="flame" /> {{ streak.streak }}
        </div>
      </div>
      <!-- desktop sidebar / mobile tab bar: one route set, two layouts -->
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
          <span class="xp-amount"><AppIcon name="sparkle" /> {{ xp.xpIntoLevel }}/{{ xp.xpForNextLevel }} bis Lv. {{ xp.level + 1 }}</span>
        </div>
        <div v-if="streak.loaded && streak.streak > 0" class="streak-chip" :class="{ 'streak-pulse': streakJustExtended }">
          <AppIcon name="flame" /> {{ streak.streak }} Tage Serie
        </div>
      </nav>
      <main class="main-content">
        <!-- mode="out-in" so the incoming page doesn't overlap the outgoing one during the
             cross-fade. -->
        <RouterView v-slot="{ Component }">
          <Transition name="route-fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
      <!-- Just the tab bar — the level/streak status row lives in .top-hud instead. Kept as its
           own fixed element (not folded into .top-hud) since it's still the primary navigation
           surface, needed even when there's no XP/streak to show. -->
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
/* Standard visually-hidden pattern: present and readable to assistive tech (unlike
   display:none/visibility:hidden), invisible and takes no layout space for sighted users. No
   existing sr-only utility elsewhere in the codebase's CSS. */
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
/* Route cross-fade: there's no ion-router-outlet here for Ionic's own page transitions to hook
   into (see the position: relative comment above), so this drives the fade directly. Each
   ion-page is already absolute+inset:0, so the two pages stacking during the fade doesn't shift
   layout. mode="out-in" runs leave then enter back-to-back, so the perceived duration is roughly
   double a single phase — --dur-slow (420ms/phase, ~840ms total) reads as sluggish for something
   as frequent as a tab switch. --dur-fast keeps the cut from feeling instant/jarring without
   lingering. */
.route-fade-enter-active,
.route-fade-leave-active {
  transition: opacity var(--dur-fast) var(--ease-out);
}
.route-fade-enter-from,
.route-fade-leave-to {
  opacity: 0;
}
/* Translucent + blurred, same tokens as every other hybrid surface, so the sweep bleeds through
   subtly instead of the nav reading as opaque chrome floating on top of the scene. Kept the
   existing solid border-right rather than the full mask-composite hairline ring other hybrid
   surfaces use, since a ring reads oddly on a straight edge-to-edge bar with no rounded corners
   — translucency+blur is what "hybrid" buys a full-bleed nav, the ring is specifically a
   card/panel affordance. See the comment on .bottom-chrome below for the clipping/legibility
   implications of a translucent fixed bar. */
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
  /* .tab-bar and its fixed ancestor .bottom-chrome (below) both need the hybrid fill together —
     otherwise an opaque layer would hide behind the translucent one. */
  background: var(--surface-hybrid-bg);
  border-top: 1px solid var(--line);
  /* Vertical padding lives on .tab-link itself, not here, so an active tab's fill block can
     reach the bar's full height edge-to-edge (see .tab-link.router-link-active below) —
     .tab-bar only keeps the safe-area clearance, which sits below the visible bar and has
     nothing to fill anyway. */
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
  /* `.tab-bar`'s `justify-content: space-around` only spaces gaps evenly, it doesn't equalize
     width — without this, five tabs render five different widths (measured 56/51/37/51/33px),
     so the "whole tab cell" active-fill below fills a different, oddly-shaped box per tab
     instead of a uniform column. flex: 1 makes every tab an equal-width column edge-to-edge,
     matching WorkoutRunsSwitcher.vue and ExerciseInfoPanel.vue's tab strips. */
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  /* --dim, matching desktop's .nav-link resting color, and with more contrast — which matters
     more here since the label is smaller (11.5px vs 13.5px). */
  color: var(--dim);
  text-decoration: none;
  padding: 9px 3px 12px;
  border-radius: var(--r-sm);
  font-weight: 700;
  /* 11.5px (10.5px below 380px, see the breakpoint below) — every bottom-nav label measured
     below the 11px readable-text floor at the previous 10px size on all 6 routes. Icons shrink
     instead below 380px so 6 items keep fitting without wrapping/clipping. */
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
/* At extreme zoom-equivalent widths (measured 195px, the standard 400% "reflow" test point per
   WCAG 1.4.10, derived from 390px @ 200%) six items no longer fit even at the shrunk 380px sizing
   above — "Läufe" and "Profil" clip off the right edge of this `position: fixed` bar with no way
   to reach them (page-level scroll doesn't reach a fixed element). Below 300px (well under any
   real layout — 360/390px devices never hit this), let the bar scroll horizontally instead of
   clipping: `flex: none` stops items shrinking to 0 so they stay tappable, `justify-content:
   flex-start` avoids space-around fighting the scroll, and the scrollbar is hidden (still
   touch/wheel scrollable) so it doesn't eat into the already-tight 9px vertical padding. */
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
/* Icons stay full-colour always, at rest and active alike — no dimmed-at-rest/full-on-active
   opacity toggle. Recognisability comes from the icon's own permanent section color; "active" is
   signalled by the surrounding block instead. */
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
/* Active-tab treatment: a filled rectangular block covering the WHOLE tab cell (mobile: the full
   tab-bar height too, via .tab-bar's default flex `align-items: stretch` making .tab-link already
   fill that height — no extra sizing needed) at one surface-lightness step up, a 2px accent rule
   across the block's TOP edge only, and the label going grey -> white. Square corners
   (border-radius: 0 overrides the resting .nav-link/.tab-link radius), no pill, no glow, no
   scale, no icon recolor. */
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
/* --fire-hi/--surface-2 measured at 1.82:1 in light mode (need 4.5:1 for AA); darkened via
   color-mix rather than inventing a new brand hex (measures ~5.3:1 against --surface-2 light). */
:root[data-theme="light"] .streak-chip {
  color: color-mix(in srgb, var(--fire-hi) 55%, black);
}
/* One-shot pulse the moment the streak actually grows, rather than looking identical whether it
   just changed or has looked the same for a week. */
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
/* --blue-hi/--surface-2 measures 2.38:1 in light mode, below AA — same fix approach as the
   .streak-chip override above: reuse an existing token rather than inventing a color, --blue-lo
   measures ~5.25:1 here. */
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
    /* The HUD overlays the header itself (see .top-hud below) instead of pushing content down,
       so no extra clearance is needed — .main-content still reads this var (0px = no-op) so
       nothing else has to change if that ever does. */
    --top-hud-h: 0px;
    /* Lets any fixed-position element know how much space the fixed .bottom-chrome tab bar
       reserves at the bottom of the viewport, the same way .main-content needs --top-hud-h for
       the top. Measured content height is ~55-61px depending on the <380px icon/font shrink
       breakpoint (9px+ icon(18-23px)+3px gap+label line(~13-14px)+12px, see .tab-link above) —
       64px is a small margin over the tallest measured case, not pixel-exact per breakpoint,
       since consumers only need "enough clearance". */
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
  /* Overlays the header (every page shares the identical header skeleton — see ionic-theme.css's
     ion-toolbar rule for height/background) instead of reserving a separate band: no extra
     clearance needed (--top-hud-h is 0 above), just a fixed overlay positioned within the
     header's own vertical band. IonTitle is centered with nothing docked to its trailing edge on
     any page, so this doesn't collide with existing header content at the widths tested
     (360-430px). */
  .top-hud {
    display: flex;
    align-items: center;
    /* Spans the whole toolbar since no title shares the row with it — ring on the left edge,
       streak on the right, the same "level first, streak second" reading order the fuller
       side-nav chips use. */
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
     it shouldn't out-shout one. --nebula-1 (not the full 3-stop --nebula-grad) keeps the glow
     restrained — a full brand gradient spinning around a tiny ring reads busier. The unfilled
     remainder uses --line-2 (an existing neutral token) rather than a new one. */
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
  /* Single fixed element for the tab bar. Content clipping behind it is prevented structurally
     via ion-content's --padding-bottom (ionic-theme.css) and .main-content's reserved
     --bottom-chrome-h, both independent of this element's own background — so the translucent
     fill below never leaves content unreachable underneath it. Text sitting on the sweep behind
     this always-visible translucent bar was checked for legibility in both themes and reads
     clearly, so it stays translucent rather than opaque. */
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
