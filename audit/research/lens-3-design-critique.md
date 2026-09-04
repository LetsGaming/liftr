# Lens 3 — Design Critique (Surface-Only Review)

**Status: historical input research — superseded by ratified decisions.** Findings here (notably
the exercise-name text-wrap bug and the duplicate top-HUD/finish-screen XP display) fed directly
into fixes now verified shipped (`audit/verify/agent-1.md` §1.4/§1.5) and into
`audit/nebula-design-system.md`/`audit/finished/plan-c-new-ui-rebuild.md`, which cite this document
by name. Kept intact, unedited, so those citations resolve. Not an open work item — but see
`audit/verify/round2-agent-1.md` and `audit/nebula-design-components.md` §2 for where the
text-truncation fix this document originally flagged is still incompletely adopted across screens
(a live/current finding, not something this historical document itself needs updating for).

Reviewer stance: senior product designer with zero repository access, working exclusively
from the running build in a browser and the two supplied share-card images. No source
code, configuration, or prior audit documents were read to produce this critique.

## 1. Method note

**Tool:** Chrome DevTools MCP (CDP-based viewport emulation), driving a fresh browser tab
against `http://localhost:5173`.

**Viewports tested:**
- 390×844 (iPhone 12/13/14 class) — primary, used for the majority of the review
- 195×844 — narrow stress test
- 320×844 — spot-check (WCAG 1.4.10 Reflow's mandated minimum), used to bound the 195px finding
- 1024×768 — tablet/desktop check

**Flows walked:** Overview ("Übersicht"), Workout tab (including the "Läufe"/Runs
sub-tab and its empty state), Ränge (Ranks) tab, Übungen (Exercises) tab and an exercise
detail sheet, Profil & Einstellungen (Profile/Settings), the routine-creation wizard
("+ Neue Routine" → "Selbst zusammenstellen"), starting a workout, logging three sets on
one exercise, and the workout finish/reward sequence. The two supplied share-card PNGs
were reviewed as static surfaces.

**Blockers and workarounds:**
- The dev server was not reachable when the session began (connection refused on
  `:5173`); it had to be restarted before any testing could occur. Once restarted, the
  browser session's existing `liftr.token` in `localStorage` meant the app loaded
  already authenticated — no login/auth screen was ever presented in the normal flow.
- To specifically test the token-gate UX, the stored token was cleared via
  `localStorage.removeItem` and the app reloaded. Every API call still returned `200`
  with full data — this local instance does not appear to enforce `LIFTR_TOKEN` at all,
  so the actual "wrong token" or "no token" failure state could not be observed
  end-to-end. The token field itself (found under Profil & Einstellungen) was inspected
  and is critiqued on its own merits below. The token was restored afterward.
- One mid-session dev-server crash/restart occurred; the app was reloaded and testing
  resumed from the same (persisted) account state.

Some findings below are reported at exact CSS pixel measurements taken via
`getBoundingClientRect()` / `getComputedStyle()` in the live page rather than eyeballed
from screenshots, and are noted as such.

---

## 2. Findings

### 2.1 Critical

**What:** At a 195px viewport width, the bottom tab bar's fifth item ("Profil") renders
completely outside the visible viewport, and part of the fourth item ("Übungen") is cut
off. Measured via `getBoundingClientRect()`: the "Profil" link occupies `x: 224–265px`
while the viewport is only 195px wide. `document.body.scrollWidth` equals the viewport
width exactly (195px) — there is no horizontal scroll to reach the hidden tab, and no
visual cue (fade, arrow, partial glyph) hints that a fifth destination exists.

**Why it fails:** The tab bar's items do not shrink, wrap, or become scrollable below a
certain width; they silently overflow their own container and are clipped with no
affordance. This is a **failure to reflow gracefully** — content is present in the DOM
but permanently unreachable by any input method at this width. For comparison, at 320px
(the width WCAG 2.2 SC 1.4.10 Reflow actually mandates) all five tabs fit with headroom
to spare (last tab ends at x≈307.7 of 320px), so the letter of 1.4.10 is met — but the
margin is exactly zero: the layout has no defensive strategy for anything narrower, which
real-world conditions can produce (small foldables, split-screen/multi-window on tablets,
browser DevTools-style embedded webviews). Primary navigation should never depend on a
viewport floor with no fallback.

**Severity:** Critical (navigation destination becomes completely unreachable, no
workaround exists for the user).

**Fix:** Give the tab bar a horizontal-scroll fallback (`overflow-x: auto` with
scroll-snap) below a defined breakpoint, or switch to icon-only labels / a "more" overflow
menu once available width per item drops under a defined minimum (e.g. ~56px per item).
At minimum, add a visible scroll/overflow indicator so a cut-off tab is never silently
invisible.

---

### 2.2 High

**What:** In the routine-creation wizard, step 2 ("Anordnen"), the exercise name
"Langhantel-Kniebeuge" wraps across four lines with mid-word hyphenation:
"Langhant / el- / Kniebeug / e" (see `wizard-step2-text-wrap-bug.png`). The same string
renders on a single line without any wrapping issue elsewhere in the app (e.g. the
Workout tab's routine card, the Ränge screen, the exercise list).

**Why it fails:** This is a text-container sizing bug specific to the reorder-list row
in step 2 — the name column is too narrow for its content and the browser's default
`overflow-wrap`/hyphenation kicks in mid-word, producing broken, hard-to-read text. This
violates basic typographic legibility and Nielsen's "aesthetic and minimalist design"
heuristic at minimum; it also reads as unfinished/buggy rather than intentional.

**Severity:** High (visibly broken text in a core creation flow; will recur for any
exercise name of similar length, and this app's exercise catalog includes many
long German compound names).

**Fix:** Give the exercise-name cell in the reorder-list row `flex: 1 1 auto` with
`min-width: 0` so it can truncate with an ellipsis (or wrap at word boundaries only,
never mid-word) instead of forcing hyphenation in an undersized column.

---

**What:** On the empty "Läufe" (Runs) screen, two buttons with the identical label
"GPX/FIT importieren" appear on screen simultaneously — one in the top action row
(next to "Manuell") and a second, full-width one inside the empty-state card
(`runs-empty-mobile-390.png`).

**Why it fails:** Nielsen's consistency/recognition heuristics assume each visible
control maps to a distinct, recognizable action. Two controls with the same exact label
give the user no way to know whether they do the same thing (redundant) or something
subtly different (confusing) without trial and error.

**Severity:** High (directly ambiguous primary action in an otherwise simple empty
state).

**Fix:** Either remove the duplicate (keep the import action only in the empty-state
card, since the top pill is redundant with the page's own "Läufe" context), or
differentiate the two controls' scope/labels explicitly if they are not in fact
identical.

---

### 2.3 Medium

**What:** On the workout finish/reward screen, a jagged black scribble artifact appears
on the front-body muscle diagram in the upper-chest region, visually distinct from and
inconsistent with the clean vector muscle overlays used everywhere else in the app
(`workout-finish-muscle-glitch.png`).

**Why it fails:** This reads as a rendering glitch (likely an SVG compositing/overlay
artifact) rather than intentional design. It appears specifically on this screen and not
on the otherwise-identical muscle diagram used on the Overview page's "Erholungszone"
card — same visual language, one instance broken.

**Severity:** Medium (cosmetic but visible on a screen users are likely to screenshot and
share).

**Fix:** Inspect the SVG layer compositing on the workout-finish muscle diagram for a
stray/duplicated path or an incorrectly clipped highlight layer; verify it renders
identically to the Overview page's version of the same component.

---

**What:** The workout finish/reward screen shows the player's level and XP progress
twice at once: once in the persistent top status pill ("Lv. 5 ✦ 747/1100 bis Lv. 6",
present on every screen) and again, seconds later, in a large dedicated "FORTSCHRITT"
card ("+369 XP", "Lv. 5", a second progress bar) directly below it.

**Why it fails:** Both elements show the same underlying number at the same time in two
different visual treatments with no connection drawn between them (no animation tying the
top pill's bar to the bottom card's bar, no shared framing). This dilutes the moment
instead of concentrating it — Nielsen's minimalist-design heuristic argues against
showing the same piece of state twice without a clear reason.

**Severity:** Medium.

**Fix:** Either suppress/dim the top status pill's XP display while the reward card is
showing (so the reward gets sole ownership of that number), or use the reward-card
reveal as the moment the top pill visibly updates (motion linking the two), rather than
having both display the resolved value simultaneously and independently.

---

**What:** The API-Token field on Profil & Einstellungen (`type="password"`, placeholder
"Token") has no show/hide toggle. Measured directly on the input element.

**Why it fails:** Password-style masking on a field the user must copy-paste or
hand-type from another device (a self-hosted server's `LIFTR_TOKEN`) offers no security
benefit here — this isn't a login credential shared across services, it's a
locally-generated bearer token — while it actively prevents the user from verifying what
they typed before hitting "Speichern." This is a textbook case against blanket password
masking (Nielsen Heuristic 5, Error Prevention) and directly increases the odds of a
silent auth failure with no diagnostic short of retyping blind.

**Severity:** Medium.

**Fix:** Add a reveal/hide (eye icon) toggle on the token field, defaulting to masked but
letting the user confirm the value before saving.

---

**What:** The primary "start this routine" action reads "▶ Starten" (German) on the
Overview page's "Bereit für heute?" card, but the same action for the same routine reads
"▶ Start" (English, unconjugated) on the Workout tab itself, one navigation hop away.

**Why it fails:** The rest of the UI is consistently German (labels, empty states,
buttons like "Workout abbrechen", "Satz speichern"). A lone English CTA breaks the
established voice and reads as an oversight rather than a deliberate bilingual choice,
violating consistency and standards (Nielsen Heuristic 4).

**Severity:** Medium.

**Fix:** Standardize on "Starten" (or whichever term is chosen) across both locations.

---

**What:** The "Workout / Läufe" segmented control uses blue to indicate the active
"Workout" segment, but the identical control uses orange to indicate the active "Läufe"
segment when that tab is selected — same component, two different accent colors for the
same "currently selected" state, depending on which option is selected.

**Why it fails:** In a system where blue is otherwise the primary/interactive accent
(CTA buttons, links, the active bottom-nav indicator) and orange is otherwise reserved
for status/streak/rank meanings (streak flame badge, rank ladder highlight, XP bar),
this segmented control borrows both colors interchangeably for the same semantic role
("this segment is active"), undermining the color system's meaning elsewhere.

**Severity:** Medium.

**Fix:** Pick one accent color for "active segment" state in this control and keep it
consistent regardless of which option is selected.

---

**What:** The routine wizard's own step indicator promises three steps — "1 Wählen · 2
Anordnen · 3 Fertig" — but tapping "Routine speichern" from step 2 ("Anordnen") closes
the wizard immediately and returns to the Workout list. Step 3 ("Fertig") is never shown.

**Why it fails:** The UI sets an explicit expectation (a 3-step process) via its own
progress indicator, then doesn't fulfill it. This is a direct violation of "match between
system and real world" / consistency (Nielsen Heuristics 2 and 4) — the system's own
chrome misrepresents its own flow.

**Severity:** Medium.

**Fix:** Either remove the "3 Fertig" step from the indicator if saving is meant to be
instant from step 2, or add a lightweight confirmation/summary step that step 3 actually
represents.

---

**What:** On the "Läufe" empty state, the "Manuell" and "GPX/FIT importieren" pill
buttons measure 38px tall (`getBoundingClientRect()`), and the same 38px height applies
to the segmented "Workout/Läufe" toggle buttons.

**Why it fails:** This clears WCAG 2.2 SC 2.5.8 Target Size (Minimum)'s 24×24px floor,
but falls short of Apple Human Interface Guidelines' 44pt minimum tap target and Material
Design's 48dp recommendation — both of which this app should be held to given it's a
touch-first mobile PWA (per its own responsive behavior and bottom tab-bar pattern, which
otherwise closely follows those conventions, e.g. the 44×44px "Mehr" kebab button
measured elsewhere).

**Severity:** Medium (inconsistent with the app's own otherwise-correct 44px targets
elsewhere; borderline rather than unusable, but flagged per the strictness mandate).

**Fix:** Raise these pill/segment buttons to at least 44px height to match the tap-target
sizing already used correctly elsewhere in the app (e.g. the routine card's kebab menu).

---

### 2.4 Low

**What:** Several screens (Workout tab's routine list, the "Läufe" empty state, and step
1 of the routine wizard) leave 40–60% of the 844px viewport height empty below their
primary content and CTAs, pushing the actionable buttons into the top half of the screen.

**Why it fails:** On a touch-first mobile layout, primary actions belong within
comfortable thumb reach — the bottom third of the screen — per established mobile
ergonomics guidance (thumb-zone design). Concentrating all interactive content at the top
and leaving the reachable bottom two-thirds empty works against one-handed use, which is
the dominant use case for a workout-logging app used mid-gym-session.

**Severity:** Low-medium (not broken, but a recurring, avoidable ergonomic cost across
multiple screens rather than a one-off).

**Fix:** Either anchor primary CTAs (Start, Import, Save) nearer the bottom of the
viewport on list/empty-state screens, or use the reclaimed space for content that
currently requires scrolling elsewhere (e.g. promote the routine list itself, or recent
activity) rather than leaving it blank.

---

**What:** In the Exercises list, most rows show a real exercise photo thumbnail, but a
few (e.g. "Abduktoren-Maschine", "Landmine Press") fall back to a generic
person-silhouette placeholder icon in the same circular slot
(`exercises-list-placeholder-inconsistency.png`).

**Why it fails:** The placeholder is visually distinct enough (flat icon vs. photograph)
to break the scanning rhythm of an otherwise photo-led list — violates consistency of
visual treatment within a single repeating list (Nielsen Heuristic 4).

**Severity:** Low.

**Fix:** Backfill missing exercise photos, or use a visually closer placeholder (e.g. a
blurred/desaturated generic gym photo) so gaps don't stand out as sharply against the
photographic rows around them.

---

**What:** The Overview page's "Körpergewicht" (bodyweight) empty-state copy reads: "Zwei
Einträge, und dein Gewichtsverlauf steht hier." ("Two entries, and your weight history
[will be] here.") This is comparatively vague next to the Läufe tab's empty state, which
spells out the action clearly: "Noch keine Läufe erfasst. Importiere eine GPX- oder
FIT-Datei aus deiner Uhr oder App, oder trage einen Lauf manuell nach."

**Why it fails:** The bodyweight empty state tells the user a threshold exists (two
entries) but never states the action to take right now (e.g. "log your weight in
Profil") — it assumes context the user may not have. This is an inconsistency in
empty-state copy quality across the same app (some empty states are actionable, this one
is only informational-and-cryptic).

**Severity:** Low.

**Fix:** Rewrite to name the concrete next action and where to take it, matching the
pattern already used successfully on the Läufe empty state.

---

**What:** The top status chrome — the Level/XP pill and the streak badge — is fixed and
present, unchanged, on every screen including the active in-workout set-logging screen,
consuming roughly 100–115px of the 844px viewport (~13%) for information unrelated to the
task of logging the current set.

**Why it fails:** During a focused task (mid-set, resting, deciding next weight), this
chrome competes with task-relevant content for prime top-of-screen real estate without
adapting to context — a missed opportunity to prioritize hierarchy contextually
(Nielsen's "aesthetic and minimalist design," and see also the "critical" finding above
where the same fixed-chrome pattern contributes to the narrow-viewport tab bar problem).

**Severity:** Low.

**Fix:** Consider collapsing or hiding the XP/streak pill during an active workout
session, restoring it on the summary/reward screen where it's contextually relevant
again.

---

### 2.5 Auth UX (structural observation, not independently reproducible here)

**What:** There is no dedicated login/auth screen anywhere in the app. The `LIFTR_TOKEN`
gate (per its own label: "Nur nötig, wenn der Server mit LIFTR_TOKEN abgesichert ist" —
"Only needed if the server is secured with LIFTR_TOKEN") is implemented as a single
password-style input, buried near the bottom of "Profil & Einstellungen," visually
identical in weight and placement to unrelated settings like the XP-visibility toggle and
the data-export button.

**Why it fails:** For a self-hosted app whose own copy says "Dein Server, dein Konto,
deine Daten" (your server, your account, your data), the credential-entry moment is not
treated as a distinct, guided step — it's one field among many in a long settings page.
A new user pointed at a token-protected instance has no dedicated screen telling them
"enter your token to continue"; they'd have to already know to scroll to Profil to find
it. This could not be verified end-to-end (this instance did not actually enforce the
token — every API call returned `200` even after clearing the stored token), so the
actual rejected/blocked-user experience is unobserved and may differ from what the static
UI implies.

**Severity:** Medium (structural/discoverability concern, confirmed by inspection, not by
reproducing an auth failure).

**Fix:** If the app is meant to support token-protected servers as a first-class case,
give unauthenticated/401 states a dedicated full-screen prompt (not a settings-page field)
explaining what's needed and why, rather than relying on the user to already know where
"Profil & Einstellungen" is.

---

## 3. Share card: old vs. current (delta as a finding)

Reviewed as static images: `liftr-workout-f25435c3.png` (current) vs.
`old/liftr-workout-b628871a.png` (previous).

**What changed:**
- **Canvas shape:** old is near-square (2160×2160); current is tall portrait
  (2160×3840, ~9:16).
- **Header:** old shows the routine's own name ("Test") as the headline; current shows a
  generic "Workout" headline with the date below, and the routine name is no longer the
  headline at all.
- **Stats:** old lists Dauer/Volumen/Sätze/PRs as a plain horizontal row of numbers with
  colored value text only; current wraps each stat in its own bordered "chip" card with a
  colored label pill (purple/blue/orange/yellow) above a black inset value box.
- **Rank badge:** old has no rank badge at all; current adds a large centered glowing
  hexagon badge with rank name and level ("LEHRLING III · Level 4").
- **Exercise list:** old truncates to 3 exercises with a "+1 weitere Übungen" note and
  minimal per-set text; current shows a full, untruncated 2-column grid of exercise cards
  with complete per-set weight×rep breakdowns and a small barbell icon per row.

**Assessment (neither uniformly better nor worse — a tradeoff, flagged per the strictness
mandate rather than framed as praise):**
- The taller 9:16 canvas is a better match for the aspect ratio dominant social-sharing
  surfaces actually use (Instagram/TikTok/WhatsApp Stories), which the near-square old
  version was not optimized for — this is a legitimate, verifiable improvement for the
  stated purpose (a shareable image).
- The new four-color stat-chip treatment (purple/blue/orange/yellow) introduces a palette
  that doesn't map onto the color language observed anywhere else in the live app (which
  uses blue for primary actions and orange for status/rank/streak, not purple or yellow
  as accent colors for arbitrary stats). The share card's palette is therefore
  self-contained and not obviously derived from — or consistent with — the app's own
  design system, which is itself a finding: a shared artifact meant to represent the
  product uses a different color system than the product does.
- The new version drops truncation entirely — the old card capped the exercise list at 3
  items; the new one renders every exercise with full per-set detail. This is more
  complete information, but combined with the new taller canvas, this is a scalability
  risk: this test routine had only 4 exercises and the card is already 3840px tall with
  substantial empty dark space at the bottom (visible in
  `liftr-workout-f25435c3.png` beyond the exercise grid). A routine with 6–8 exercises
  would produce a share image of unclear, possibly excessive, final height, which was not
  and could not be tested here since the routine used only had a small number of
  exercises logged.
- The rank badge is now a large, prominent, animated-looking focal element on a shareable
  image — a significant increase in how much the card foregrounds gamification framing
  versus the workout data itself, compared to the old version, which had no such element.
  Whether that emphasis is desirable is a product-direction question outside this
  critique's scope, but the shift in what the card is "about" (workout record vs.
  achievement flex) is a substantive, not cosmetic, change worth naming explicitly.

---

## 4. Holds up

The following were specifically verified in this session and did not fail under the
above scrutiny. Named specifically per the review's requirements.

- **The exercise detail bottom sheet (e.g. "Bankdrücken")**: uses a drag-handle affordance
  at the top, a labeled close control with the accessible name "Schließen" (not just an
  icon with no name), and a clear tab structure (Über/Rang/Statistiken/Verlauf). The close
  button being properly labeled for assistive tech, rather than left as an unlabeled icon
  button, satisfies WCAG 4.1.2 Name, Role, Value.

- **Set-logging control labels during an active workout**: the weight and rep steppers
  expose their current value directly in their accessible name — e.g. "Gewicht
  bearbeiten, aktuell 42.5 kg" and "Wiederholungen bearbeiten, aktuell 0" — verified via
  the accessibility tree, not just visually. This means a screen-reader user gets the
  current state without needing to cross-reference a separate visual label, which is
  better practice than a bare "Edit" button would be.

- **The disabled "Satz speichern" (Save set) button**, while reps are still at 0, pairs
  its disabled state with an inline explanatory hint directly below it — "Erst
  Wiederholungen, dann speichern." This is a correctly-avoided failure mode: a disabled
  button with no explanation forces the user to guess why it won't respond; here the
  reason is stated in place (Nielsen Heuristic 5, error prevention).

- **The rest timer after logging a set** ("Pause: 1:30 · startet nach dem Satz") is
  paired with an explicit "Überspringen" (Skip) control, verified present and clickable.
  An automatically-started countdown that still gives the user an escape hatch avoids
  trapping them in a system-initiated wait (Nielsen Heuristic 3, user control and
  freedom).

- **Immediate confirmation on set save**: logging a set produces a green checkmark row
  showing the exact recorded values ("✓ 42.5 kg · 5 Wdh.") in place of the "offen" (open)
  placeholder — directly observed after saving three consecutive sets in this session.
  This satisfies visibility of system status (Nielsen Heuristic 1) without requiring a
  separate toast or page transition.

- **The "Mehr" (kebab/overflow) button on routine cards** on the Workout tab measures
  exactly 44×44px via `getBoundingClientRect()` — meeting the Apple HIG 44pt minimum tap
  target, in direct contrast to the smaller 38px controls flagged above elsewhere in the
  same app. Shown as a passing example precisely because the same app gets this right in
  one place and not another.

- **Locked/unreached rank labels on the Ränge (Ranks) ladder** (e.g. "APEX", "EXPERTE"),
  despite their visually muted gray appearance, measured a contrast ratio of
  approximately 7.67:1 against their background (`rgb(152,162,192)` on
  `rgb(10,12,20)`, computed via the WCAG relative-luminance formula) — comfortably above
  the 4.5:1 WCAG AA threshold for normal text, and above the 7:1 AAA threshold as well.
  The "grayed out" visual language does not come at the cost of legibility.

- **Layout adaptation at 1024px tablet width**: the app switches to a persistent left
  sidebar navigation instead of simply stretching the mobile single-column layout wider,
  indicating a deliberate breakpoint rather than a naive scale-up (verified directly via
  screenshot at 1024×768).

- **The exercise-selection confirm button in the routine wizard** ("Übungen auswählen" /
  later "N ausgewählt · Weiter") stays disabled until at least one exercise is checked,
  preventing submission of an empty selection — verified via the accessibility tree
  (`disableable disabled` state) before any exercise was selected, and `disableable`
  (enabled) immediately after one was checked.
