<script setup lang="ts">
// Attributions (plan Phase 3.3) — required by license for every ingested third-party source
// (audit §4). Static content; nothing here is fetched at runtime, matching the ingest-once rule.
//
// First page migrated onto Ionic Vue (Phase 5's larger migration) — the pattern every other
// page follows: IonPage/IonHeader/IonToolbar/IonTitle/IonContent instead of a bare <div>, with
// tokens.css (via ionic-theme.css) still the source of the actual visual design.
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Quellen &amp; Lizenzen</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <div class="attributions-content">
        <p style="color: var(--dim)">
          Liftr importiert Referenzdaten einmalig (nicht bei jeder Anfrage) aus den folgenden Quellen.
        </p>

        <ul class="sources">
          <li>
            <b>wger Exercise Database</b> — Übungskatalog, Muskelgruppen-Tags
            <span class="license">CC-BY-SA</span>
            <p>github.com/wger-project/wger</p>
          </li>
          <li>
            <b>Muskel-Diagramm (Anatomie-Figur)</b> — Körperumriss + 15 einzeln hervorgehobene Muskeln, mirror von wger's Assets, ursprünglich abgeleitet von "Muscular system.svg"/"Muscular system-back.svg" von Termininja
            <span class="license">CC-BY-SA 3.0</span>
            <p>commons.wikimedia.org · via github.com/wger-project/wger · eigene Einfärbung für das Dark-Theme</p>
          </li>
          <li>
            <b>free-exercise-db (yuhonas)</b> — Start-/End-Positionsbilder
            <span class="license">Unlicense (gemeinfrei)</span>
            <p>github.com/yuhonas/free-exercise-db</p>
          </li>
          <li>
            <b>OpenPowerlifting</b> — Kraftstandards (Kniebeuge/Bankdrücken/Kreuzheben)
            <span class="license">CC0 (gemeinfrei)</span>
            <p>openpowerlifting.org</p>
          </li>
          <li>
            <b>OpenStreetMap</b> — Kartendaten für Laufrouten
            <span class="license">ODbL</span>
            <p>© OpenStreetMap-Mitwirkende</p>
          </li>
        </ul>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* Was the one page with no top-level content width/centering at all — every other tab
   standardized on one of the four --content-w-* tiers (see tokens.css); this is genuinely a
   single-column reading list, same shape as Profil's settings column, so it gets the same
   "narrow" tier. */
.attributions-content {
  max-width: var(--content-w-narrow);
  margin: 0 auto;
}
.sources {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  margin-top: var(--sp5);
}
.sources li {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--sp4);
}
.license {
  display: inline-block;
  margin-left: var(--sp2);
  font-size: 11px;
  font-weight: 700;
  color: var(--dim);
  background: var(--surface-3);
  padding: 2px 8px;
  border-radius: 999px;
}
.sources p {
  font-size: 12px;
  color: var(--faint);
  margin-top: 4px;
}
</style>
