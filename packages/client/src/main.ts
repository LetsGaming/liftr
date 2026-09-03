import { IonicVue } from "@ionic/vue";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n";
import { router } from "./router";
import { getStoredTheme } from "./stores/themeStore";
import { useSyncStore } from "./stores/syncStore";

// Ionic's structural/typography CSS only — deliberately not its color/palette CSS, since
// tokens.css (ported verbatim from the mockup) stays the single source of truth for the
// visual design. Ionic is themed to it (see styles/ionic-theme.css), not the other way round.
import "@ionic/vue/css/core.css";
import "@ionic/vue/css/normalize.css";
import "@ionic/vue/css/structure.css";
import "@ionic/vue/css/typography.css";
import "@ionic/vue/css/padding.css";
import "./styles/tokens.css";
import "./styles/motion.css";
import "./styles/ionic-theme.css";

document.documentElement.dataset.theme = getStoredTheme();

const app = createApp(App);
const pinia = createPinia();
app.use(IonicVue).use(pinia).use(router).use(i18n).mount("#app");

// starts flushing the offline write queue as soon as we're online (plan 1.3)
useSyncStore(pinia).startAutoFlush();
