<script setup lang="ts">
import { useOnboardingDraft } from "./OnboardingDraft";

const draft = useOnboardingDraft();
</script>

<template>
  <div class="step">
    <h2>Über dich</h2>
    <p class="step-hint">Alles optional — wird für die Rang-Berechnung (Gewicht / Körpergewicht) verwendet.</p>

    <section class="field">
      <label>Geschlecht</label>
      <div class="chip-row">
        <button class="chip" :class="{ active: draft.sex === 'male' }" @click="draft.sex = 'male'">Männlich</button>
        <button class="chip" :class="{ active: draft.sex === 'female' }" @click="draft.sex = 'female'">Weiblich</button>
      </div>
    </section>

    <section class="field">
      <label>Geburtsjahr</label>
      <div class="input-shell">
        <input v-model="draft.birthYearInput" type="text" inputmode="numeric" placeholder="z.B. 1995" />
      </div>
    </section>

    <section class="field">
      <label>Aktuelles Körpergewicht</label>
      <div class="input-shell weight-row">
        <input v-model="draft.weightInput" type="text" inputmode="decimal" placeholder="z.B. 72,5" />
        <span class="unit">kg</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.step {
  display: flex;
  flex-direction: column;
  gap: var(--sp5);
}
.step h2 {
  font-size: 20px;
}
.step-hint {
  font-size: 12.5px;
  color: var(--faint);
  margin-top: -8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.field label {
  font-size: 13px;
  font-weight: 700;
}
/* "surface-hybrid" input treatment (tokens.css §F3) — same recipe .panel/.surface-hybrid use
   elsewhere (blurred translucent fill + gradient-hairline edge), reapplied here via a wrapper div
   rather than tokens.css's utility classes directly: ::after (which paints the hairline ring)
   doesn't render on a replaced form control like <input> in any browser, so the wrapper carries
   the surface + ::after ring and the input itself becomes a transparent, borderless layer on top. */
.input-shell {
  position: relative;
  border-radius: var(--r-md);
  background: var(--surface-hybrid-bg);
  backdrop-filter: blur(var(--surface-hybrid-blur));
  -webkit-backdrop-filter: blur(var(--surface-hybrid-blur));
  box-shadow: var(--surface-hybrid-shadow);
}
.input-shell::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: var(--surface-hybrid-edge-grad);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
.field input {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 12px 14px;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 16px;
}
.weight-row {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
.weight-row input {
  flex: 1;
}
.unit {
  position: relative;
  z-index: 1;
  color: var(--faint);
  font-size: 13px;
  padding-right: var(--sp3);
}
.chip-row {
  display: flex;
  gap: var(--sp2);
}
.chip {
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 14px;
  font-weight: 600;
}
/* Selected state uses the same CTA gradient .btn-primary uses (tokens.css), not a flat --blue-lo
   fill. --nebula-ink-on-fill on every stop of --nebula-grad-cta is already the app's proven
   AA-safe combination (worst stop ~5:1, see tokens.css's .btn-primary comment), so this reuses
   it verbatim rather than inventing a new pairing. */
.chip.active {
  background: var(--nebula-grad-cta);
  border-color: transparent;
  color: var(--nebula-ink-on-fill);
  font-weight: 800;
}
</style>
