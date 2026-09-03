# Nebula — Design Layout

How `nebula-design-framework.md`'s tokens and `nebula-design-patterns.md`'s components compose
across Liftr's actual screens. This document does not re-derive the IA, screen inventory, or
phase structure — it inherits `audit/plan-c-new-ui-rebuild.md` §1/§3 wholesale (the five-zone nav:
Today / Train / Progress / Plan / Profile, plus Runs) and specifies only what Nebula changes about
each zone's layout. Where Plan C already specifies a layout decision and Nebula doesn't touch it,
that's stated explicitly rather than re-explained.

---

## 0. Navigation shell

**Unchanged from Plan C §3 Phase 0:** five-zone bottom-tab IA, state-conditional Train tab,
narrow-viewport fallback, 1024px+ sidebar reflow, `ThumbZoneAction`/density/`TruncatingLabel`
primitives.

**Nebula addition:** the active-tab indicator, currently falling back to `--tier-accent`/`--blue-hi`
per `tokens.css`'s comment on `App.vue`'s nav (§534-544, "generic aliases for whatever tier is in
scope"), gets a further fallback layer to `--nebula-grad` when no tier context is in scope at all
(i.e., the nav chrome itself, outside any specific tier's rank card) — same fallback-chain pattern
already established for `.rankbar`.

---

## 1. Today (home)

**Unchanged from Plan C §3 Phase 1:** readiness hero, streak/tokens-remaining chip copy framing,
one-tap routine-start cards, quick-start fallback, unified empty-routines/empty-history first-run
flow.

**Nebula layout notes:**
- HUD (level-ring, streak chip) sits at the top exactly where it does today — `nebula-design-
  philosophy.md` §5 explicitly rejected P3's "hero rank at top" restructure. Today's content order
  is: HUD strip → readiness hero → routine cards → (below the fold) secondary content. No reorder.
- The one-tap "start routine" card's CTA button is the sole `.btn-primary` on this screen and is
  the only element besides the HUD getting Nebula's gradient — the readiness hero and routine cards
  themselves stay on the neutral `.panel` treatment, so the CTA reads as *the* action to take, not
  one gradient surface among several.

---

## 2. Train (active workout)

**Unchanged from Plan C §3 Phase 1:** stepper direct-entry, three rest-timer states, set-kind
picker, superset rail, stale-session nudge, bodyweight-null-vs-zero distinct affordances, RPE/notes
capture (new UI, no existing pattern — Plan C's migration note stands unmodified).

**Nebula layout notes:**
- `hideTopHud` stays true here (existing logic, `App.vue`) — Train shows no HUD chrome at all,
  Nebula or otherwise. This screen's whole visual budget stays on the logging surface itself.
- The set-kind picker's active/selected state and the rest-timer's active ring both currently use
  `--blue`/`--tier-accent`; both migrate to `--nebula-ink` (solid, not gradient — these are
  *frequent*, ~30×/session interactions per `lens-2` §2.6, and framework §1.3's rule reserves
  gradient-clip for rare/decorative instances, not steady-state UI a user stares at dozens of times
  a session).
- The "Satz speichern" log-set button is `.btn-primary` — gets Nebula's gradient fill per pattern
  §3. This is the single highest-frequency tap in the whole app; framework §5's glow-rationing rule
  matters most here specifically, since a glowing CTA that fires 30×/session would read as noise,
  not reward. **The button gets the Nebula fill; it never gets the glow** — glow is reserved for
  the `success`-tier haptic events downstream of this tap (a rank-up, a PR), not the tap itself.
- The `+XP` chip (float-and-fade, `~1600ms`) keeps its existing motion contract unchanged; its
  numeral color becomes `--nebula-ink` (solid) instead of plain `--text`, giving it a small
  identity tie to the reward system without adding a new animation.

---

## 3. Finish Sequence & Progress

**Unchanged from Plan C §3 Phase 2:** sequential skippable beats, literal LP-bar animation from
`prevLp`→`lp`, same-band-recovery vs. rank-up vs. plausibility-discounted visual distinction,
single-source-of-truth XP display (closing `lens-3` §2.3's duplicate-display finding), Ranks list
server-order preservation, `synthetic`-vs-real trust-standard distinction, Personal Records ledger
as new-pattern UI, History's honest offline posture.

**Nebula layout notes:**
- **Rank-up beat:** tier medallion renders in its own metal gradient (pattern §2); the beat's
  surrounding chrome — background wash, "Weiter tippen →" prompt, the continue affordance — gets
  Nebula's glow for exactly this beat's hold duration, then it's gone. The medallion additionally
  shows the Nebula ring (pattern §2) for this one beat, marking "this badge just changed" visually
  distinct from just browsing to the Ranks tab later and seeing the same badge at rest.
- **Same-band recovery gain:** per Plan C's existing "lighter single-beat tag, not a full
  celebration" rule — no Nebula glow, no ring. The LP bar still animates (motion is unchanged), it
  just doesn't get the earned-color treatment layered on top.
- **Plausibility-discounted session:** hard rule, stated in both `nebula-design-philosophy.md` §3
  and `nebula-design-framework.md` §5 — this path structurally cannot trigger Nebula glow/ring,
  because it never fires the `success`-tier event the glow rule keys off. This needs a test case in
  `nebula-design-plan.md`'s verification checklist, not just a written rule.
- **Ranks page:** the "Rangaufstiege" 7-day weekday strip (Plan C §3 Phase 2) — cells for days with
  an actual rank-up get a small Nebula-tinted dot; cells with no rank-up stay neutral. This is the
  one *persistent* (non-transient) Nebula usage in the whole app, justified because it's
  historical fact ("a rank-up happened this day"), not ambient decoration — the glow-rationing rule
  in framework §5 is about *transient* glow specifically, and doesn't forbid a small solid-color
  historical marker.
- **Personal Records screen:** new screen, no existing visual pattern (Plan C's own note). Row
  treatment: `.panel-reward--nebula` (pattern §5) for the achieving row only, one-time, at the
  moment a PR is newly set — the ledger's steady-state list (browsing past PRs) renders on the
  plain `.panel` treatment with a small `--nebula-ink` PR-kind badge, not a full gradient card per
  row (a screen full of gradient cards would defeat the "earned = rare" signal entirely).

---

## 4. Plan (routines, mesocycles, exercise catalog)

**Unchanged from Plan C §3 Phase 3:** routine list density, drag-reorder motion contract, wizard
step-indicator accuracy fix, equipment-substitution copy, mesocycle week-indicator, exercise-
catalog placeholder-image policy.

**Nebula layout notes:** this whole zone is explicitly low-Nebula by design — it's `plan-c`'s
"planning-desk," deliberately denser and more form-like, not a reward surface. The only Nebula
touchpoint is the wizard's final "Speichern"/"Routine erstellen" primary button (pattern §3). Route
picker chips, muscle-group toggles, and the exercise catalog's search/filter chrome stay on the
existing neutral system — a form-heavy screen covered in brand gradient would read as trying too
hard, not as more premium.

---

## 5. Profile, Data & Auth

**Unchanged from Plan C §3 Phase 4:** staged/skippable onboarding fields, deferred equipment setup,
bodyweight log, data export, dedicated auth/token entry point with reveal toggle.

**Nebula layout notes:**
- **New: theme toggle** (`nebula-design-framework.md` §2.2) lives here — a simple two-state control
  (Dunkel/Hell) in the same settings-row style as everything else on this screen, no special
  treatment. This is the one purely net-new piece of UI this whole rework adds outside the color
  system itself.
- The account-level overall-tier summary (Plan C §3 Phase 2's "Overall Rank," surfaced again on
  Profile) follows the same medallion+ring rule as §3 above — resting state, no ring, no glow.

---

## 6. Runs

**Unchanged from Plan C §3 Phase 5** in full — single-import-action empty state, route map/replay.
No Nebula touchpoint on this screen beyond the shared `.btn-primary` CTA fill; Runs has no rank/XP/
streak surface of its own to carry the identity gradient further.

---

## 7. Cross-cutting layout rule

Across every zone above, the same shape repeats deliberately: **exactly one `.btn-primary` per
screen carries Nebula's gradient at rest; every other Nebula appearance is transient, tied to a
specific `success`-tier event, and reverts to neutral once that event's motion window ends.** If a
future screen spec calls for a second always-on gradient surface on the same screen, that's a
signal to re-read `nebula-design-philosophy.md` §1 before adding it — the whole point collapses if
Nebula becomes ambient instead of a signal.
