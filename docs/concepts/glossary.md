# Glossary

Short, cross-referenced definitions for domain terms used throughout Liftr's docs and codebase.
For the full mechanics behind any of these, follow the link to the concept doc that owns it.

### Rank engine

- **Tier** — one of nine named strength bands (Initiate → Apprentice → Trainee → Athlete →
  Lifter → Advanced → Elite → Expert → Apex), the top level of the rank ladder. See
  [rank-engine.md](./rank-engine.md#tiers-divisions-and-ordinals).
- **Division** — a sub-band within a tier. Division numbers count *down* as you get stronger
  (division N = weakest/entry, division 1 = closest to promotion). Tiers have different division
  counts — more at the bottom, fewer at the top — see `TIER_DIVISION_COUNT` in
  `packages/shared/src/rank/tiers.ts`.
- **LP** — "league points," a 0–100 position within the current tier/division band, i.e. how far
  through that specific band a lifter's value sits.
- **Ordinal** — a single ascending integer that flattens the whole tier/division ladder into one
  comparable scale, so two (tier, division) pairs can be compared with plain `<`. See `ordinal()`/
  `ordinalToBand()` in `tiers.ts`.
- **Anchor (lift/exercise)** — one of the 9 exercises with a *real*, externally-sourced threshold
  table (5 loaded lifts from OpenPowerlifting, 4 bodyweight movements from published rep norms).
  Every other exercise's thresholds are derived from one of these by ratio. See
  [catalog-and-equipment.md](./catalog-and-equipment.md#anchors-derived-and-synthetic--in-the-catalog-itself).
- **Derived (standard/trust)** — a threshold table computed by scaling an anchor's own thresholds
  by a per-exercise ratio, for a close variant of the anchor movement. Never more trustworthy than
  its own anchor.
- **Synthetic (standard/trust)** — the same derivation mechanism as "derived," applied to the
  long-tail isolation/accessory catalog, where the ratio is closer to an informed estimate than a
  sourced number. The UI marks synthetic (and derived) numbers with a `≈` rather than presenting
  them with the same confidence as a real standard.
- **Trust tier** — the `real | derived | synthetic` label carried on every threshold, governing
  how confidently the UI is allowed to present a rank number.
- **Peak rank** — a permanent, ratchet-only "best ever" snapshot per exercise. Never recomputed
  retroactively (e.g. against today's bodyweight); only ever replaced by a genuinely stronger,
  corroborated result. See [rank-engine.md](./rank-engine.md#peak-vs-current-rank).
- **Current rank** — the *displayed* rank, which can sit below peak due to inactivity-driven
  decay, and climbs back toward peak over several sessions rather than snapping instantly.
- **Corroboration** — the requirement that a new peak candidate be matched or exceeded on at least
  one *other* calendar day (not just its own best-ever set) before it's allowed to replace the
  stored peak. Prevents one outlier set from permanently defining a lifter's rank.
- **Decay** — the fixed-window heuristic that softens *current* (never peak) rank after a
  training gap, hard-floored at the bottom of the peak's own tier so it never erases all progress.
- **e1RM** — estimated one-rep max, computed from a single logged set via the Epley formula
  (`weight × (1 + reps/30)`). Used for PR tracking and display; kept deliberately separate from
  rank's own scoring curve.
- **Skill score / rank skill score** — rank's own scoring curve (`rankSkillScore`), a three-zone
  piecewise function distinct from Epley, used only to resolve tier/division/LP — not shown as a
  display number. See [rank-engine.md](./rank-engine.md#skill-score-not-raw-e1rm).
- **Load ratio** — skill score (or e1RM) divided by bodyweight; the metric loaded (non-bodyweight)
  exercises are ranked on.
- **Plausibility (gate/multiplier)** — a per-workout heuristic (pace, improbable jump, ceiling)
  that discounts — never discards — a session's XP/rank contribution when it looks structurally
  implausible. See [rank-engine.md](./rank-engine.md#the-plausibility-gate).
- **Overall Lifter Rank** — the one account-level aggregate: a trust-weighted average of
  continuous ordinal position across every ranked exercise. The single number answering "how good
  a lifter am I, overall," on top of otherwise-independent per-exercise ladders.

### XP, levels, and streaks

- **XP** — flavour reward layered on top of rank; never gates or replaces anything rank-related.
  Computed per-set (`computeSetXp`) and summed via `computeTotalXp`. See
  [xp-and-streaks.md](./xp-and-streaks.md).
- **Level** — derived purely from cumulative total XP via a power-law curve (`computeLevel`); a
  readout, not an independent source of truth.
- **Repeat-set decay** — the rule that XP for an identical exercise/weight/reps combo shrinks
  (toward a floor, never to zero) each time it's logged again, nudging toward progression.
- **Consistency bonus** — a once-per-finished-workout XP bonus that scales with `sqrt` of the
  current streak length (capped), rewarding calendar-spread training.
- **Variety bonus** — a once-per-finished-workout XP bonus for primary muscles trained this
  session that weren't trained in the immediately preceding finished session.
- **Streak** — the count of consecutive active training days, computed fresh from a set of
  activity dates on every read rather than incrementally maintained.
- **Protection token** — one "free pass" that lets a missed day skip the streak without breaking
  it. Pool size derives from the lifter's own stated weekly training frequency.

### Sync and offline

- **Outbox** — the client's local IndexedDB queue of not-yet-confirmed mutations
  (`packages/client/src/lib/idb.ts`), flushed to `/api/sync` in the background.
- **Flush** — the act of POSTing the outbox (in chunks) to the server and removing only the items
  the server confirms. See [sync-and-offline.md](./sync-and-offline.md#the-outbox-store-syncstorets).
- **`clientId`** — a UUID minted on-device for every outbox item, used by the server to make
  replaying the same item twice a safe no-op (idempotent upsert).
- **Client-generated ID** — a `start_workout`/`add_exercise` row's primary key, also minted
  on-device, so the client never needs a round trip to the server before it can reference that row
  from a later mutation (e.g. logging a set against a workout that hasn't synced yet).
- **Active workout snapshot** — the crash-recovery copy of the in-progress workout kept in
  IndexedDB, restored on reload so a dead battery or app kill mid-set loses nothing.

### Catalog and equipment

- **Curated catalog** — Liftr's deliberately small (~90-exercise) exercise list
  (`tools/catalog/curated.yaml`), biased toward movements with a real or derivable strength
  standard rather than exhaustively covering every possible exercise.
- **Required / recommended / optional (equipment tier)** — how strongly an exercise depends on a
  piece of equipment. Only `required` gaps block an exercise from being performable with what a
  user owns; `recommended`/`optional` surface as softer UI hints.
- **Support equipment** — props (bench, rack, pull-up bar, etc.) that matter for "can I actually
  do this" but are deliberately excluded from the primary `Equipment` vocabulary used for
  icons/filtering.
