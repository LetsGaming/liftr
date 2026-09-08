<script setup lang="ts">
// Attributions page — required by license for every ingested third-party source. Static
// content; nothing here is fetched at runtime, matching the ingest-once rule.
//
// Uses the same IonPage/IonHeader/IonToolbar/IonTitle/IonContent pattern every other page
// follows instead of a bare <div>, with tokens.css (via ionic-theme.css) still the source of
// the actual visual design.
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
          Eine Ausnahme: die Routenberechnung für geplante Strecken fragt OpenRouteService bei Bedarf
          live pro Anfrage ab, nicht einmalig.
        </p>

        <ul class="sources">
          <li class="surface-hybrid">
            <b>wger Exercise Database</b> — Übungskatalog, Muskelgruppen-Tags
            <span class="license">CC-BY-SA</span>
            <p>github.com/wger-project/wger</p>
          </li>
          <li class="surface-hybrid">
            <b>wger Exercise Database</b> — Übungsfotos für 2 Übungen ohne freie
            free-exercise-db-Aufnahme ("Einbeiniges RDL", "Pike-Liegestütze")
            <span class="license">CC-BY-SA 4.0</span>
            <p>
              wger.de/media/exercise-images · Autoren: Tierrasverdes (Einbeiniges RDL), Nash
              (Pike-Liegestütze). Das Pike-Liegestütze-Foto ist laut wger als KI-generiert
              gekennzeichnet ("is_ai_generated") — bewusst übernommen, da keine andere frei
              lizenzierte Aufnahme dieser Übung existiert.
            </p>
          </li>
          <li class="surface-hybrid">
            <b>Muskel-Diagramm (Anatomie-Figur)</b> — Körperumriss + 15 einzeln hervorgehobene Muskeln, mirror von wger's Assets, ursprünglich abgeleitet von "Muscular system.svg"/"Muscular system-back.svg" von Termininja
            <span class="license">CC-BY-SA 3.0</span>
            <p>commons.wikimedia.org · via github.com/wger-project/wger · eigene Einfärbung für das Dark-Theme</p>
          </li>
          <li class="surface-hybrid">
            <b>free-exercise-db (yuhonas)</b> — Start-/End-Positionsbilder
            <span class="license">Unlicense (gemeinfrei)</span>
            <p>github.com/yuhonas/free-exercise-db</p>
          </li>
          <li class="surface-hybrid">
            <b>OpenPowerlifting</b> — Kraftstandards (Kniebeuge/Bankdrücken/Kreuzheben)
            <span class="license">CC0 (gemeinfrei)</span>
            <p>openpowerlifting.org</p>
          </li>
          <li class="surface-hybrid">
            <b>OpenStreetMap</b> — Kartendaten für Laufrouten
            <span class="license">ODbL</span>
            <p>© OpenStreetMap-Mitwirkende</p>
          </li>
          <li class="surface-hybrid">
            <b>OpenRouteService</b> — Routenberechnung für geplante Strecken
            <span class="license">CC-BY 4.0</span>
            <p>openrouteservice.org · © openrouteservice.org by HeiGIT</p>
          </li>
        </ul>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* Every tab standardizes on one of the four --content-w-* tiers (see tokens.css); this is a
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
/* `.surface-hybrid` (template, tokens.css) supplies background/blur/shadow/hairline for these
   rows; only radius/padding stay local here. */
.sources li {
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
