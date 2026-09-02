---
target: RanksPage (rank engine UI)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-02T10-09-13Z
slug: packages-client-src-pages-rankspage-vue
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No loading state on any of the 4 data sources; ladder can show wrong default "Initiate" before data resolves |
| 2 | Match System / Real World | 4 | German tier vocabulary, thematic names, LP defined in-context — strong |
| 3 | User Control and Freedom | 3 | Reversible chart expand; no escape hatch from a rank card to full exercise history |
| 4 | Consistency and Standards | 3 | Three different reward-surface gradient formulas for the same "this is a reward" concept |
| 5 | Error Prevention | 2 | Decayed rank isn't visually distinguished from a fresh one beyond a quiet caption color |
| 6 | Recognition Rather Than Recall | 3 | Current position always visible; but ladder never shows peak for a demoted user |
| 7 | Flexibility and Efficiency | 2 | No sort/filter on the rank-card grid; no "closest to rank-up" surfacing |
| 8 | Aesthetic and Minimalist Design | 3 | Tier gradients loud by design, chrome stays quiet — hierarchy holds |
| 9 | Error Recovery | 1 | `plausibilityNote`/anti-cheat explanation never reaches this page; derived-vs-synthetic distinction is `title`-only (unreachable on touch) |
| 10 | Help and Documentation | 3 | LP-explainer toggle is a good, minimal in-context disclosure pattern |
| **Total** | | **26/40** | **Acceptable (65%)** |

## Design Specificity Verdict

Mostly specific, with two generic-leaderboard reflexes underneath (donut chart, rank-up calendar reusing the streak visual with zero differentiation).

Deterministic scan: CLI clean. Live scan: 22 anti-pattern groups (33 raw findings), 10 confirmed false positives (text-occlusion = the detector's own overlay re-scanning itself). Real findings: 16 sub-11px labels (every ladder count + calendar day labels + section eyebrows), 2 ai-color-palette flags on the Experte (cyan) and Elite (purple) badges — the two tiers that break from the otherwise bespoke gradient system — 1 tight-leading + 1 long-line finding both on the LP-explainer paragraph (line-height 1.0, ~264 chars/line), and 3 bounce-easing hits on the same cubic-bezier as Overview.

Mobile viewport could not be forced in either browser tool; all visual evidence is desktop-only.

## Overall Impression

Real product identity in tier vocabulary and badge craft, but under-serves the one thing that makes an anti-cheat rank system trustworthy: explaining itself when something surprising happens. Peak rank and plausibility notes are fetched/computed and then discarded or hidden. Combined with zero loading states and detector-confirmed readability gaps, the page reads competent but under-defended at its highest-stakes moments.

## What's Working

- The decay-caption color escalation (upgraded to second-loudest text on the card) — shows a lower rank loudly with an explanation rather than hiding it.
- The curiosity-framed dead-end ("Nächstes Ziel: ???") turns an exhausted-standards wall into an intentional hook.
- The LP-explainer relocation to a single page-level disclosure (vs. per-card tooltip) is architecturally sound, even though the same fix wasn't extended to the derived/synthetic trust distinction.

## Priority Issues

**[P1] Anti-cheat/plausibility feedback has no home on the persistent page**
`plausibilityNote`/`recoveryGainLabel` never reach RanksPage; only appear transiently in the finish sequence. Derived-vs-synthetic trust distinction is `title`-only — invisible on touch and to screen readers.
Fix: pass plausibility data through to RanksPage; replace title-only trust distinction with a tap-to-reveal pattern matching the existing LP-explainer.
Suggested command: `/impeccable clarify`

**[P1] Zero loading state anywhere on the page**
All 4 data sources load with no skeleton/spinner; ladder can show wrong default position, analytics/grid are blank during load.
Fix: skeleton state matching Overview's status-strip pattern.
Suggested command: `/impeccable harden`

**[P2] Peak overall rank fetched and discarded**
`overallRankStore.peak` loads but is never surfaced; ladder shows only current position even after a demotion.
Fix: ghost-rung/peak marker on the ladder, reusing existing decay-caption logic.
Suggested command: `/impeccable clarify`

**[P2] Detector-confirmed readability/consistency gaps**
16 sub-11px labels (every ladder count, all 7 calendar day labels); LP-explainer paragraph at 1.0 line-height / ~264 chars-per-line; Experte/Elite badges use generic gradients breaking from the bespoke tier system.
Fix: raise labels to ≥11px, fix explainer leading/width, bring flagged badges in line with the rest of the tier system.
Suggested command: `/impeccable audit`

**[P3] Rank-card grid has no capacity limit, grouping, or sort**
Flat auto-fill grid; fine at 4 exercises, will sprawl for power users.
Fix: group/sort by proximity to next rank-up.
Suggested command: `/impeccable layout`

## Persona Red Flags

**Riley (Stress-Tester)**: Investigates a lower-than-expected LP after a plausibility-gated set; finds only a `≈` marker whose specific meaning (derived vs. synthetic) is locked behind an unreachable `title` tooltip. No plausibility note reaches this page.

**Sam (Accessibility)**: `title`-only trust distinction is inaccessible on two axes (no screen-reader exposure, no keyboard trigger). Ladder states distinguished mostly by opacity over dark tier colors — thin signal for low vision. Plus 16 sub-11px labels and a 1.0 line-height paragraph.

**Casey (Distracted Mobile User)**: Tapping a rank card both toggles its chart and is the entire hit target — fires a network fetch with no loading indicator in the chart slot, inviting repeat taps. Mobile layout itself unverified this run (CSS-only assessment).

## Minor Observations

- Donut/calendar 2-up row reads as low information density with only 4 tracked exercises.
- Rank-card grid's auto-fill can strand a single card alone in its own row.
- Reward-surface gradient implemented three separate ways across the codebase — individually justified, cumulative consistency cost.
- RankUpCalendar reuses the streak-flame visual for a conceptually different, more significant event with zero differentiation.
- Same broadly-scoped bounce easing on `body` as flagged on Overview.

## Questions to Consider

- What if the ladder showed both current and peak position simultaneously, given peak is already fetched and discarded?
- What if `plausibilityNote` persisted as a per-exercise history entry instead of only existing in the ephemeral finish sequence?
- What if the rank-card grid sorted by "closest to next rank-up"?
