---
target: OverviewPage (dashboard)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-02T09-54-31Z
slug: packages-client-src-pages-overviewpage-vue
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good local patterns (shimmer skeleton, "Wird gestartet…") but no global stuck-loading signal |
| 2 | Match System / Real World | 2 | "LP", "Gesamtrang", "Division" (e.g. "SILBER III") are unexplained jargon on the hook screen |
| 3 | User Control and Freedom | 2 | Suggested routine can't be swapped from this screen; selection is fully implicit |
| 4 | Consistency and Standards | 4 | One StatTile, one `.panel`/`.panel-reward` vocabulary, one badge/tier system reused everywhere |
| 5 | Error Prevention | 2 | `suggestedRoutine = routines[0]` (source-comment-acknowledged placeholder) one-tap-starts with zero confirmation |
| 6 | Recognition Rather Than Recall | 3 | Per-tier color consistency; volume caption defaults sensibly |
| 7 | Flexibility and Efficiency | 3 | One-tap start / auto-resume is a real accelerator; nothing beyond tap |
| 8 | Aesthetic and Minimalist Design | 2 | Six full-weight sections stacked with no prioritization or collapse |
| 9 | Error Recovery | 1 | Only the activity feed checks `history.error`; status-strip/progress-tiles show no error state — live-verified as silent dashes |
| 10 | Help and Documentation | 1 | No inline explanation of LP/tier/division terms; onboarding fires once at mount, unreachable again from this screen |
| **Total** | | **23/40** | **Acceptable (57%)** |

## Design Specificity Verdict

**Split personality — the RPG layer is specific; the container around it is template-shaped.**

**LLM assessment**: The tier/rank material (bevel/extrusion/specular badge layering with distinct gradient *shapes* per metal band, TierLadder's lit-current-rung treatment, Erholungszone's muscle-heatmap rest-day hook) is bespoke, game-informed craft that couldn't be mistaken for a generic template. But the dashboard scaffolding wrapping it — a KPI strip, a bar-chart tile, a top-N list tile, an icon+meta+value activity feed — is the industry-standard fitness-dashboard skeleton also found in Strava, MyFitnessPal, Apple Fitness. The screen's most-viewed real estate (the status strip) currently carries none of the app's visual DNA.

**Deterministic scan**: `detect.mjs` was clean on the source (`.vue`/CSS, 0 findings across OverviewPage.vue, components/ui, components/rank). The **live, rendered-DOM scan found 12 anti-pattern groups (14 flagged elements)**, all invisible to static analysis because they depend on computed styles at runtime:
- **Low contrast** (3 instances): `b.tnum` stat numbers at 2.9:1 against a medium-blue gradient (need 3:1); `div.eyebrow.lp-eyebrow` at 4.2:1 and `p.lp-hint` at 4.4:1 against navy (need 4.5:1) — all borderline-fails, not dramatic ones, but real.
- **Undersized functional text** (6 instances): every section eyebrow label ("Volumen (8 Wochen)", "Top Ränge", "Körpergewicht", "Entdecken", "Letzte Aktivität", the Launchpad eyebrow) renders at 10.5px, below the 11px floor.
- **Long lines** (2 instances): the Launchpad hint paragraph (~164 chars/line) and a tile-empty paragraph (~171 chars/line) both run far past the ~80-char readability target.
- **Bounce easing on `body`**: `cubic-bezier(0.34, 1.56, 0.64, 1)` — a springy overshoot curve applied at the document root, which is an unusually broad scope for that easing.

No false positives identified. These corroborate the LLM's "aesthetic/hierarchy" and "help & documentation" concerns with hard numbers rather than impression.

**Visual overlays**: Browser mutation and injection succeeded, but true mobile-viewport emulation (390×844) failed after repeated attempts in both the primary browser tool and its chrome-devtools fallback — the evidence above is desktop-viewport only. No reliable mobile-specific overlay is available from this run; the mobile 2×2 stat-grid and bottom-tab layout were assessed from source/CSS media queries, not visually confirmed. Re-run with a tool that can force a real mobile viewport if mobile-specific visual confirmation is needed.

**Operational note**: Assessment A's cleanup ran a broad `pkill -f vite`, which appears to have also stopped a Vite dev server that was already running before this critique started (not one it launched itself). If you had an active `npm run dev` session open, it was likely killed — you'll need to restart it.

## Overall Impression

The rank/tier system is the product's real point of view, and where it's on screen (badges, ladder, Erholungszone) it looks and feels unlike a generic tracker. But Overview itself — the screen a returning user hits every single day — doesn't lead with that identity: it opens with a fully-expanded six-section stack, several accessibility-detector-confirmed rough edges (small text, borderline contrast), and a data-loading path that goes silent rather than communicating failure. The single biggest opportunity is making Overview *behave* like a dashboard for a rank-progression app (one clear "here's what to do next," rank identity foregrounded, everything else collapsed) instead of a generic six-card fitness-tracker stack that happens to contain rank material.

## What's Working

- **Token/component discipline compounds into real coherence.** One canonical StatTile, one `.panel`/`.panel-reward` vocabulary, and one badge/tier CSS system reused identically across TierLadder and the Top-Ränge tile make every reward-tinted surface across the *whole app* read as "the same currency" — rare, and it pays off specifically because it's applied everywhere, not just here (Consistency & Standards scored 4/4 for a reason).
- **The tier badge material work is legitimately bespoke.** Distinct gradient shapes per metal band (broad-soft bronze vs. compressed-polished silver vs. non-monotonic gold vs. hue-rotating iridescent) give the rank system physical weight that a template couldn't produce.
- **Erholungszone avoids the manipulative streak-guilt pattern** common in gamified fitness apps ("leg trotzdem los, wo du willst" even when nothing is clearly recovered) while still giving users a concrete reason to open the app on a rest day — motivational psychology used without coercion.

## Priority Issues

**[P0] Silent, unbounded loading/error state above the fold**
- **Why it matters**: Live-verified by both assessments — when history/xp/streak/readiness never resolve, the status-strip and progress-tiles render 4 dashes plus a literal "0" plus 3 "not enough data yet" tiles indefinitely with zero indication anything is wrong. Only the activity feed checks `history.error`. For an app whose entire premise is "you always know your status," a flaky connection breaks that promise silently, and this isn't a rare edge case — any slow load triggers it.
- **Fix**: Add a single top-level banner/state on `.dashboard` when any store is neither loaded nor errored after a timeout, and make every stat tile distinguish "still loading" from "genuinely zero" from "failed to load."
- **Suggested command**: `/impeccable harden`

**[P1] Six full-weight sections with no prioritization**
- **Why it matters**: Erholungszone, Launchpad, the status strip, 3 progress tiles, Discover, and the activity feed all render fully expanded on every open, even though "start my workout" (Launchpad) is almost always the only actionable item for a daily returning user. Cognitive-load check: 5 of 8 items failed (single focus, chunking-at-the-page-level, hierarchy, one-thing-at-a-time, progressive disclosure).
- **Fix**: Default to Launchpad + one glanceable status line above the fold; collapse Erholungszone/progress-tiles/Discover behind a single reveal for returning users.
- **Suggested command**: `/impeccable distill`

**[P1] Unexplained jargon at the exact screen meant to hook first-timers**
- **Why it matters**: "LP", "Gesamtrang", and division labels like "SILBER III" appear with no in-context explanation. The one onboarding hook (`OnboardingGuide`) fires once at mount and isn't reachable again from Overview — once dismissed, a first-timer has no path back to "what do these numbers mean."
- **Fix**: Add a lightweight, always-available "what is this?" affordance directly on the rank/LP status tile, not gated behind a one-time modal.
- **Suggested command**: `/impeccable clarify`

**[P2] Detector-confirmed accessibility rough edges**
- **Why it matters**: Runtime scan found borderline-failing contrast on stat numbers (2.9:1 vs. 3:1 needed) and two label/hint colors (4.2:1, 4.4:1 vs. 4.5:1 needed), plus six section-eyebrow labels rendering at 10.5px (below the 11px floor) and two paragraphs running 160-170 chars/line. These are small individually but numerous, and they land on the screen's most-repeated UI pattern (section eyebrows appear 6+ times).
- **Fix**: Bump eyebrow font-size to ≥11px and nudge the three flagged color pairs to meet WCAG AA; cap hint/description paragraph width.
- **Suggested command**: `/impeccable audit`

**[P2] `suggestedRoutine = routines[0]` can silently one-tap-start the wrong workout**
- **Why it matters**: The source code's own comment flags this as a stand-in for "last used," not the real logic. There's no way to override it from the dashboard, and the primary CTA ("▶ Starten") acts on it with zero confirmation — a mis-suggested routine gets started with one tap.
- **Fix**: Either implement real "last used" logic, or add a lightweight swap affordance on the Launchpad card before treating it as a confident default.
- **Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Jordan (First-Timer)**: Lands on a screen reading "Gesamtrang: —" with "LP" abbreviations and division labels like "SILBER III," none explained. The one onboarding hook fires once at mount and isn't reachable again from this page — once dismissed, Jordan has no path back to "what do these numbers mean." Will misread the rank system as either broken or irrelevant.

**Casey (Distracted Mobile User)**: Live-verified — on a slow/cellular load, Casey sees 4 stat tiles reading "—"/"0" plus three "not enough data yet" tiles stacked with a routine CTA: a screen that reads as *broken or empty* rather than *loading*, with nothing distinguishing "still fetching" from "you truly have zero data." High bounce risk before data ever arrives.

**Sam (Accessibility-Dependent User)**: The 8-bar weekly-volume chart conveys trend purely through relative pixel height plus a caption that updates on tap/hover — no `aria-live` region, no text-based trend summary (e.g. "+12% vs. last week") anywhere on the page. Additionally, detector-confirmed: stat-tile numbers and two label colors sit at borderline-failing contrast ratios, and every section eyebrow renders below the 11px minimum functional-text size.

## Minor Observations

- The "Entdecken" (Discover) section shares the exact `.tile`/`.progress-tiles` visual recipe as the stats section directly above it — on a quick scroll, navigation cards and data cards blend into one undifferentiated row.
- "Erste Routine anlegen" routes to `/workout` rather than directly into routine creation — an extra hop for a brand-new user's very first action.
- App.vue's top-HUD pulses the streak chip on increase, but the dashboard's own streak StatTile doesn't share that animation — a missed reinforcement moment exactly where the user is already looking at the number.
- The injected detector confirmed a springy `cubic-bezier(0.34, 1.56, 0.64, 1)` bounce easing scoped to `body` — worth checking whether that broad a scope is intentional.

## Questions to Consider

- What if Overview defaulted to just Launchpad + one glanceable status line, with everything else collapsed behind a single reveal — would daily engagement improve if the screen respected that most opens are "start my workout," not "audit six stat blocks"?
- What if a stalled/errored data load were a first-class state everywhere (one banner at the top of `.dashboard`), instead of four tiles quietly saying "—" forever?
- What if "Gesamtrang"/"LP"/tier terms carried a one-tap "what is this?" affordance right on the status tile itself, turning the dashboard into the on-ramp for new users instead of assuming the ranking system was already absorbed elsewhere?
