# UI/UX & Engagement Research: General Principles for Product Design

*Compiled 2026-09-02. Pure research — general, evidence-based principles independent of any specific competitor or of Liftr's current implementation. Intended to inform design decisions for a mobile-first, dark-themed PWA.*

---

## 1. Mobile UI/UX Principles

### Information hierarchy & cognitive load
- Clear visual hierarchy and consistent structure let users find what they need with minimal mental effort; following platform conventions (native navigation patterns, standard iconography) reduces cognitive load because the user isn't learning a new mental model — they're reusing one they already have. ([Wearetenet](https://www.wearetenet.com/blog/ui-ux-design-for-mobile-applications), [Webstacks](https://www.webstacks.com/blog/mobile-ux-design))
- "Less is more" remains the dominant mobile principle: generous white space, a small number of clearly-weighted elements per screen, and deliberate omission of anything non-essential to the task at hand.
- **Progressive disclosure** — revealing complexity only as the user needs it — is not just aesthetic minimalism, it's measurable: Nielsen Norman Group's usability research found progressive disclosure can cut task completion time by 20–40% while improving comprehension, and interactive/staged guidance can reduce completion time by up to 35% while increasing success rates by ~40%. ([NN/g via Digia summary](https://www.digia.tech/post/mobile-app-onboarding-activation-retention/))
  - Practical translation: default screens should show the "80% case," with advanced options, edit modes, and rarely-used settings tucked one tap away rather than always visible.

### Touch targets & thumb-zone ergonomics
- Minimum touch target size of ~44×44pt (Apple HIG) / 48×48dp (Material) to prevent mis-taps; this is a long-standing, still-current baseline.
- On a mobile-first, one-handed product, primary actions (the ones performed most often — e.g., logging a set, starting a session) belong in the lower/reachable third of the screen ("thumb zone"); destructive or rarely-used actions can live further away or behind confirmation. ([Wearetenet](https://www.wearetenet.com/blog/ui-ux-design-for-mobile-applications), [Skyrye](https://skyryedesign.com/design/ux-ui/mobile-ui-design/))
- Interaction cost (total attention + effort required to reach a goal) is itself a usability metric — every extra tap, every ambiguous label, every moment of "where do I go now" is a small tax that compounds over a session. ([NN/g](https://www.nngroup.com/))

### Dark-mode-specific considerations
- **Never use pure black (#000000) as a base surface.** Material Design recommends dark grey (~#121212) instead — pure black creates excessive contrast against light text/icons, which increases eye strain (a "halation" effect) and can make small text harder to read, not easier. ([Netguru](https://www.netguru.com/blog/tips-dark-mode-ui), [Material Design](https://m2.material.io/design/color/dark-theme.html))
- **Elevation is expressed with lighter surfaces, not heavier shadows.** In dark mode, traditional drop-shadows barely read against a dark background; the convention that replaced them is a layering system where surfaces *higher* in the z-order get progressively *lighter* fills (subtle white overlays at low opacity), not darker.
- **Desaturate accent colors.** Fully saturated, vibrant colors vibrate/glow uncomfortably against dark backgrounds and can produce a distracting halo effect; Material's guidance is to desaturate hues used in dark theme relative to their light-theme values.
- **Text opacity tiers, not pure white.** Material's convention: ~87% white opacity for high-emphasis text, ~60% for medium/secondary text, ~38% for disabled — pure #FFFFFF on dark backgrounds reads as harsh and reduces legibility versus a slightly-softened white.
- Aim for strong contrast ratios for body text (guidance cited up to 15:1 for comfortable body reading, well above the WCAG AA minimum of 4.5:1) — dark mode does not get a pass on accessibility; if anything it needs more deliberate contrast auditing because "it looks fine to me in this lighting" is a common false-negative failure mode. ([Netguru](https://www.netguru.com/blog/tips-dark-mode-ui), [UX Design Institute](https://www.uxdesigninstitute.com/blog/dark-mode-design-practical-guide/))

**Sources:** [Webstacks – Mobile UX Design Guide 2025](https://www.webstacks.com/blog/mobile-ux-design); [Wearetenet – 12 UI/UX Principles for Mobile Apps](https://www.wearetenet.com/blog/ui-ux-design-for-mobile-applications); [Skyrye Design – Mobile UI Design Principles](https://skyryedesign.com/design/ux-ui/mobile-ui-design/); [Netguru – 11 Tips for Dark Theme Design](https://www.netguru.com/blog/tips-dark-mode-ui); [UX Design Institute – Dark Mode Practical Guide](https://www.uxdesigninstitute.com/blog/dark-mode-design-practical-guide/); [Nielsen Norman Group](https://www.nngroup.com/).

---

## 2. Motion & Animation Design Principles

### The core question: should this even animate?
The single most load-bearing idea across current motion-design thinking (especially from practitioners like **Emil Kowalski**, design engineer at Linear, creator of Sonner/Vaul and the *Animations on the Web* course) is that **restraint is the skill, not decoration**. His stated philosophy: "The goal is not to animate for animation's sake, it's to build great user interfaces." Frequently-used, goal-directed tools (his example: Raycast) often benefit from *near-zero* animation, because users with a clear task in mind don't want to wait for delight — they want the frictionless path to done. Animation is best reserved for moments that need *orientation, feedback, or continuity*, not applied uniformly as brand flourish. ([Emil Kowalski's public notes, indexed via multiple skill/reference repos](https://emilkowal.ski/skill))

### Feedback vs. delight vs. decoration
- **Feedback animation** communicates a state change: this saved, this failed, this expanded, this is loading. It should be fast, legible, and never block the user from their next action.
- **Delight animation** is a deliberate, occasional reward (a completion celebration, a milestone) — it earns its cost precisely because it's rare. Overusing "delight" motion (staggered entrances on every list render, bouncy pop-ins on every card) cheapens it and adds latency to routine actions, which reads as slow rather than premium.
- **Decorative motion** — movement with no informational payload — is the first thing to cut when in doubt. Apple's own guidance explicitly warns against animating high-frequency interactions: "avoid adding motion to interactions that occur frequently... you should avoid making people spend extra time watching unnecessary motion every time they interact with something." ([Apple HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/motion))

### Duration & easing conventions
- Material Design 3 guidance: standard UI transitions on mobile run roughly 150–200ms for small/local changes and 300–400ms for larger, full-surface transitions; durations should scale with the distance traveled and the size of the element, not be a single global constant. ([Material Design 3 — Easing and Duration](https://m3.material.io/styles/motion/easing-and-duration))
- Emil Kowalski's practitioner rule of thumb: UI animations should generally stay **under 300ms**; something around 150–200ms tends to read as "responsive," while durations creeping toward 400ms+ start to read as sluggish rather than smooth, even though technically nothing is "wrong."
- **Asymmetric easing feels more natural than symmetric easing.** Material's guidance and general animation theory (echoed in Disney's classic animation principles, referenced by Josh Comeau) both point to eased curves — fast-then-slow (ease-out) for things entering/settling, frontloaded deceleration — reading as more physical and less mechanical than linear or symmetric ease-in-out timing. Motion that accelerates and decelerates asymmetrically (mirroring real-world physics/momentum) is consistently rated as more "natural." ([Material Design — Duration & Easing](https://m1.material.io/motion/duration-easing.html), [Josh W. Comeau — Animation](https://www.joshwcomeau.com/animation/))
- Spring-based motion (rather than fixed-duration easing curves) tends to read as higher quality/"premium" specifically because it responds naturally to interruption — a spring that's mid-animation and gets re-targeted continues fluidly, whereas a fixed easing curve interrupted mid-flight typically snaps or restarts, which reads as janky. This interruptibility is a recurring theme in both Josh Comeau's and Apple's own motion guidance (Apple's UI is built extensively on spring physics for exactly this reason).

### Reduced motion & accessibility
- Respecting the OS-level "Reduce Motion" accessibility preference is not optional polish — it's the current baseline expectation. Apple's guidance: when Reduce Motion is enabled, apps should **minimize or eliminate animations**, typically substituting cross-fades or static transitions for parallax/movement-heavy transitions. The same expectation exists on the web via the `prefers-reduced-motion` media query. ([Apple HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/motion))
- Reduced-motion isn't only about vestibular disorders/motion sickness (though that's the primary accessibility driver) — it's also a legitimate *preference* for users who find animation distracting when trying to move quickly through a familiar, frequently-used tool.
- A design system should draw the reduced-motion line at "does this animation carry information," not "does this animation look nice" — informational transitions (e.g., a state changing) should degrade to an instant or cross-fade equivalent, not disappear entirely and leave the user without feedback.

**Sources:** [Emil Kowalski's motion-design writing, aggregated](https://emilkowal.ski/skill); [Apple Human Interface Guidelines — Motion](https://developer.apple.com/design/human-interface-guidelines/motion); [Material Design 3 — Easing and Duration](https://m3.material.io/styles/motion/easing-and-duration); [Material Design (M1) — Duration & Easing](https://m1.material.io/motion/duration-easing.html); [Josh W. Comeau — Animation articles](https://www.joshwcomeau.com/animation/); [Carbon Design System — Motion](https://carbondesignsystem.com/elements/motion/overview/).

---

## 3. Engagement & Retention: An Ethical Framework

### The habit-formation baseline: Fogg's B=MAP
BJ Fogg's Behavior Model states a behavior only occurs when **Motivation, Ability, and a Prompt** converge at the same moment (B=MAP). Key implications for product design:
- **Ability = simplicity.** The model treats "ability" primarily as *removing friction*, not adding incentive — a person with low motivation can still act if the action is trivially easy; conversely no amount of incentive reliably overcomes a genuinely high-friction action.
- **Prompts must match the user's motivation/ability position.** A prompt sent to someone with neither motivation nor ability just produces annoyance (this is the mechanism behind notification fatigue and "notification blindness").
- Fogg's own applied methodology, **Tiny Habits**, is explicitly about anchoring a new tiny behavior to an existing routine and letting consistency (not intensity) compound — the opposite of engagement tactics that try to maximize time-in-app per session. ([Fogg Behavior Model](https://www.behaviormodel.org/), [BJ Fogg](https://www.bjfogg.com/))

### Self-determination theory: a healthier substitute for pure operant conditioning
Deci & Ryan's **Self-Determination Theory (SDT)** proposes three innate psychological needs whose satisfaction drives durable, high-quality (intrinsic) motivation and wellbeing: **autonomy** (agency over one's choices), **competence** (a sense of growing mastery, with clear feedback), and **relatedness** (social connection/belonging). ([NN/g — Autonomy, Relatedness, and Competence in UX](https://www.nngroup.com/articles/autonomy-relatedness-competence/))
- Applied to gamified products: research on mHealth apps found gamification's effect on continued use was mediated specifically through whether it satisfied autonomy, competence, and relatedness — not through the game mechanics themselves. ([PMC — Gamification-Induced Feelings and mHealth App Continued Use](https://pmc.ncbi.nlm.nih.gov/articles/PMC8391751/))
- Critically, the same research literature notes that points/badges used as **controlling** mechanisms ("do X to earn Y") can *undermine* intrinsic motivation rather than build it — this is the classic SDT finding that extrinsic reward can crowd out intrinsic interest when the reward is experienced as controlling rather than informational.
- Design translation: a reward or badge that *informs* the user about their own competence ("you just hit a new PR") supports SDT; a reward that exists purely to manipulate return visits ("come back or you lose this") does not — even though both can be built with identical UI components.

### The Hook Model and its own author's caveat
Nir Eyal's **Hook Model** (Trigger → Action → Variable Reward → Investment) is the most widely cited applied framework for habit-forming product design. Two things are important to hold together:
1. Eyal himself, in *Hooked*, included a section explicitly on "The Morality of Manipulation" and later proposed a **Manipulation Matrix** — asking whether the *maker* would use their own product, and whether the product materially improves the user's life — as a self-check on whether a given Hook is ethical or exploitative. ([Robbie Kellman Baxter — Nir Eyal on ethically hooking subscribers](https://robbiekellmanbaxter.com/blog/bestselling-author-nir-eyal-on-how-to-ethically-hook-your-subscribers/))
2. Critics note this self-check is necessary but not sufficient — the same mechanical loop (variable reward + investment) that builds a healthy habit in one context reads as addictive design in another, and the difference often isn't visible in the UI at all, only in the intent and in downstream metrics (does usage correlate with the user's own stated goals, or only with the company's). Eyal's later book, *Indistractable*, was itself criticized for placing the burden of resisting manipulative design back onto the user ("distractibility is a personal failing") rather than on the product maker who engineered the pull. ([Business Digest — What's wrong with trying to be Indistractable?](https://business-digest.eu/whats-wrong-with-trying-to-be-indistractable/?lang=en))

### Variable rewards: the addictive core, named plainly
The "variable reward" step of the Hook Model is mechanically identical to a **variable-ratio reinforcement schedule** — the same schedule that makes slot machines and loot boxes compelling. Research on loot boxes specifically found that *rare* rewards trigger measurably larger arousal/reward responses and a greater urge to keep opening more, i.e., the mechanism is not hypothetical, it's been observed physiologically. ([PMC — Rare Loot Box Rewards](https://pmc.ncbi.nlm.nih.gov/articles/PMC7882574/)) Belgium and the Netherlands have gone as far as regulating loot boxes under gambling law specifically because of this mechanism. ([Univ. of Colorado Law Review — Techlash, Loot Boxes, and Dark Patterns](https://lawreview.colorado.edu/print/when-the-cats-away-techlash-loot-boxes-and-regulating-dark-patterns-in-the-video-game-industrys-monetization-strategies/))
- Not every variable reward is a dark pattern — genuine unpredictability in a *useful* outcome (e.g., you don't know in advance which workout will produce a new personal record) is fine. The dark-pattern version specifically engineers randomness where none needs to exist, purely to keep a user pulling the lever.

### Named examples: sustainable engagement vs. dark patterns

| Sustainable engagement (SDT-aligned) | Dark pattern (compliance/guilt-driven) |
|---|---|
| Progress feedback that reflects real competence gain (e.g., a strength curve, a PR log) | Streaks whose *loss* is framed as a personal failure/loss of identity rather than a neutral reset ("you made Duo sad") |
| Reminders timed to the user's own stated goals/schedule, easy to adjust or turn off | Reminders engineered around emotional manipulation — guilt copy, sad mascots, loss-aversion framing, sent regardless of whether the user opted in ([Duolingo notification critique](https://webdesignerdepot.com/the-art-of-duolingo-notifications-the-subtle-manipulation-of-language-learners/)) |
| Milestones/badges that *inform* ("you just deadlifted 2x bodyweight") | Points/badges used as a *controlling* incentive layer disconnected from real progress, encouraging users to optimize the metric instead of the underlying goal ("streak" that rewards logging in over actually training) — this is the documented "streak creep" failure mode ([The Decision Lab — Streak Creep](https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification)) |
| Genuine variability tied to real-world outcomes the user cares about | Manufactured randomness/gacha-style reward reveals with no functional reason to be random, designed purely to exploit variable-ratio reinforcement ([loot box research](https://pmc.ncbi.nlm.nih.gov/articles/PMC7882574/)) |
| A single missed day treated as neutral — "pick back up," possibly with a grace mechanic | A single missed day disproportionately punished — total streak reset, shaming copy, loss of accumulated status all at once |
| Social features that build genuine relatedness (shared training, accountability with real people) | Social features engineered mainly to create comparison anxiety or FOMO (leaderboards designed to always show you someone just ahead, "friends are doing this without you" nudges) |

**Sources:** [Fogg Behavior Model](https://www.behaviormodel.org/); [BJ Fogg](https://www.bjfogg.com/); [NN/g — Autonomy, Relatedness, and Competence](https://www.nngroup.com/articles/autonomy-relatedness-competence/); [PMC — SDT and mHealth App Gamification](https://pmc.ncbi.nlm.nih.gov/articles/PMC8391751/); [Robbie Kellman Baxter — Nir Eyal on ethical hooks](https://robbiekellmanbaxter.com/blog/bestselling-author-nir-eyal-on-how-to-ethically-hook-your-subscribers/); [Business Digest — critique of Indistractable](https://business-digest.eu/whats-wrong-with-trying-to-be-indistractable/?lang=en); [The Decision Lab — Streak Creep](https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification); [WebDesignerDepot — Duolingo notification manipulation](https://webdesignerdepot.com/the-art-of-duolingo-notifications-the-subtle-manipulation-of-language-learners/); [PMC — Rare Loot Box Rewards](https://pmc.ncbi.nlm.nih.gov/articles/PMC7882574/); [Univ. of Colorado Law Review — Loot Boxes and Dark Patterns](https://lawreview.colorado.edu/print/when-the-cats-away-techlash-loot-boxes-and-regulating-dark-patterns-in-the-video-game-industrys-monetization-strategies/).

---

## 4. Attention & Audience Design Fundamentals

### The peak-end rule
Kahneman's research (drawing on the distinction between the "experiencing self" and the "remembering self") found people judge a past experience mainly by its **most intense moment (peak)** and **how it ended**, largely independent of total duration. Practical implications for product design:
- You do not need every moment of a session to be delightful — you need to identify (or engineer) one genuine peak (a completed workout summary with a real, earned insight; a visible new record) and make sure the *ending* of any given flow feels resolved and positive, not abrupt or ambiguous.
- Conversely, a single sharply negative moment — a crash, a confusing dead end, a punitive message — right before the user closes the app can retroactively color their memory of an otherwise fine session. Ending states deserve outsized design attention relative to their actual screen-time. ([Laws of UX — Peak-End Rule](https://lawsofux.com/articles/2020/peak-end-rule/), general synthesis of Kahneman's work)

### Onboarding / first-run experience
- The first session is the highest-leverage, highest-loss moment in a product's lifecycle — a large share of total user drop-off across consumer apps happens in the very first session, before the user has reached "activation" (the moment they first experience real value).
- Evidence-backed patterns:
  - **Defer account creation** until after the user has sampled real value — deferred signup has been shown to meaningfully lift activation rates versus gating everything behind a signup wall up front.
  - **Progressive disclosure in onboarding itself** — staged, interactive guidance beats a single wall of tips/tour slides; NN/g's research on interactive guidance found it can meaningfully increase both completion speed and success rate versus static walkthroughs.
  - **Minimize upfront data collection** — ask for one or two fields at a time, spread over multiple natural moments, rather than a long form before any value has been delivered.
- The goal of onboarding is not "show every feature," it's "get the user to their first genuine win as fast as possible" — showing capability is secondary to proving value. ([Digia — Mobile App Onboarding Guide](https://www.digia.tech/post/mobile-app-onboarding-activation-retention/), [NN/g progressive disclosure research, as summarized](https://www.nngroup.com/))

### Empty states and error states as retention moments, not afterthoughts
- An empty state (no data yet) and an error state (something went wrong) are both moments where the interface has to communicate *without* the thing it normally relies on (real content) — and both are disproportionately likely to occur for new or returning-after-a-gap users, i.e., exactly the users a product can least afford to lose.
- Best practice: explain clearly *why* the state is empty/broken, and always pair that explanation with a concrete next action — never leave a dead end. Generic placeholder copy ("No data") with no path forward is a measurable drop-off driver.
- Tone matters: empathetic, non-punitive copy in an error state (own the failure, don't blame the user) builds trust; empty states are also a legitimate place for light personality/brand voice precisely because there's no real content competing for attention.
- The framing that matters most: empty/error states are not edge cases to patch at the end of a build — they are *guaranteed* touchpoints for exactly the at-risk segment of users (day-one users, lapsed users returning), so their design quality has outsized leverage on retention relative to how often they're prioritized in practice. ([Toptal — Empty States: The Most Overlooked Aspect of UX](https://www.toptal.com/designers/ux/empty-state-ux-design), [UXPin — Designing the Overlooked Empty States](https://www.uxpin.com/studio/blog/ux-best-practices-designing-the-overlooked-empty-states/))

**Sources:** [Laws of UX — Peak-End Rule](https://lawsofux.com/articles/2020/peak-end-rule/); [Digia — Mobile App Onboarding, Activation, Retention](https://www.digia.tech/post/mobile-app-onboarding-activation-retention/); [Nielsen Norman Group](https://www.nngroup.com/); [Toptal — Empty States](https://www.toptal.com/designers/ux/empty-state-ux-design); [UXPin — Overlooked Empty States](https://www.uxpin.com/studio/blog/ux-best-practices-designing-the-overlooked-empty-states/).

---

## 5. Synthesized Checklist — Questions to Ask of Any Screen or Flow

**Hierarchy & cognitive load**
1. If I removed this element, would the user actually miss it on *this* screen, or does it belong one tap deeper (progressive disclosure)?
2. Is the single most important action on this screen the visually dominant one — or is it competing with three other things of equal visual weight?
3. Can the primary action be comfortably reached with a thumb, without a hand shift?

**Dark mode & visual craft**
4. Is any surface pure black or pure white? (It shouldn't be — check for softened tones and an elevation-via-lightness system instead of shadow-only depth.)
5. Are accent colors desaturated enough to avoid "glowing" against the dark background?
6. Would this pass a real contrast check for body text, not just "looks fine on my monitor"?

**Motion**
7. Does this animation communicate a *state change*, or is it decoration with no informational payload?
8. If this interaction happens dozens of times a day, have I kept its animation minimal/fast — reserving heavier motion for rare, meaningful moments?
9. Is the duration proportional to the size/distance of what's moving, and does it stay under ~300ms for routine UI feedback?
10. Does this respect `prefers-reduced-motion` / the OS reduce-motion setting, and if so, does the reduced version still deliver the *information* the animation was carrying (via an instant change or cross-fade), not just delete the feedback entirely?
11. If the user interrupts this animation mid-flight (taps again, navigates away), does it degrade gracefully rather than snapping/restarting?

**Engagement mechanics — the sustainable/dark-pattern test**
12. Does this reward *inform* the user about real competence gained, or does it exist purely to manipulate a return visit?
13. If a user misses a day, does the mechanic treat it as a neutral pause, or does it punish disproportionately (full streak reset, guilt copy, loss framing)?
14. Would the person who built this notification/reminder be comfortable receiving it themselves, unlocked from any business KPI? (Eyal's own "manipulation matrix" question.)
15. Does this feature give the user real autonomy (their own goals, adjustable frequency, easy opt-out), or does it quietly remove choices to keep them engaged?
16. Is any randomness/variability in this reward tied to a real-world outcome the user cares about, or is it manufactured suspense with no functional reason to exist?
17. Does a social/comparison feature build genuine relatedness, or is its main effect anxiety/FOMO?

**Attention & lifecycle moments**
18. In this flow, what is the peak moment, and is it actually being treated as one (visually, in copy, in pacing)? What is the ending, and does it resolve cleanly rather than trailing off or dead-ending?
19. In the first session, how many taps/fields stand between the user and their first genuine "this works" moment? Can any of that be deferred?
20. Does every empty state explain *why* it's empty and offer one clear next action — no dead ends?
21. Does every error state take blame appropriately (system, not user) and offer a path forward, rather than just reporting failure?
22. Are onboarding and empty/error states being designed with the same care as the "happy path" screens — or are they the last 10% bolted on at the end?
