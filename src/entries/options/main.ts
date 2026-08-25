import { createApp } from "vue";
import App from "./App.vue";

// Vue Plugins
import { vuetifyInstance as vuetify } from "./plugins/vuetify";
import { piniaInstance as pinia } from "./plugins/pinia";
import { routerInstance as router } from "./plugins/router";
import { i18nInstance as i18n } from "./plugins/i18n";
import VueKonva from "vue-konva";

async function bootstrap() {
  // Safari MV3 does not reliably keep the Firefox-style background page alive.
  // Register the DOM-dependent handlers in the options page so site import,
  // search and user-info parsing remain available while the UI is open.
  if (__BROWSER__ === "safari") {
    await import("./safariRuntime.ts");
  }

  createApp(App).use(pinia).use(i18n).use(router).use(vuetify).use(VueKonva, { prefix: "Vk" }).mount("#app");
}

bootstrap().catch((error) => console.error("Failed to start PT-Depiler options page", error));
