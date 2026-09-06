# Nebula visual audit — 2026-09-06

Live click-through of the merged Wave 1 redesign, dev server + real browser, dark mode unless
noted. Screenshots below; findings recorded in `audit/workplan-v1.md`'s dated entry and reported
to the product owner in-session.

| File | Screen | Finding |
|---|---|---|
| `01-onboarding.png` | Onboarding, step 1 (Willkommen) | **Bug.** Flat black, zero visible sweep. Root cause: `OnboardingGuide.vue` passes `background="var(--bg)"` to its full-bleed modal — that's an opaque solid color, not transparent, so it fully blocks `body::before`'s sweep. |
| `02-onboarding-step2.png` | Onboarding, step 2 (Über dich) | Same bug, confirmed across steps. |
| `03-overview.png` | Übersicht (dark) | Sweep technically present (`body::before` confirmed via computed style) but not visibly perceptible — cards packed near-edge-to-edge at ~88% opacity leave almost no exposed background. |
| `04-workout-empty.png` | Workout, no active session | Sweep faintly visible in open corners — the sparsest screen in the app, and still subtle. |
| `05-workout-active.png` | Workout, active set-logging | Hybrid cards/hairlines present and reasonably consistent; next-exercise line visible. |
| `06-ranks.png` | Ränge | No visible sweep; tier ladder correctly stayed on the flat metal system (by design). |
| `07-exercises.png` | Übungen list | No visible sweep; dense list, same pattern as Overview. |
| `08-exercise-info.png` | Exercise-info sheet (Bankdrücken, Über tab) | No visible sweep in the sheet header/chrome. |
| `09-profile.png` | Profil & Einstellungen | No visible sweep; dense card stack. |
| `10-records.png` | Rekorde | Same pattern. |
| `11-runs.png` | Läufe | Same pattern. |
| `12-overview-light.png` | Übersicht (light mode) | A little more visible tint in open gaps than dark mode's equivalent, but still faint; card hairlines not really discernible against white. |

**Headline conclusion:** the background-sweep/hybrid-surface CSS is implemented correctly
everywhere checked (verified via `getComputedStyle`, not just visual impression) — this is a
calibration and one real-bug problem, not an "it didn't get built" problem. See the analysis
delivered in-session for the full breakdown of why intensities tuned against open mockups read as
near-invisible against real, content-dense screens.
