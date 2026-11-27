import { QueryClientProvider } from "@tanstack/solid-query";
import { JSXElement } from "solid-js";

import { queryClient } from "../../queries";
import { getActivePage, getGlobalOffsetTop } from "../../states/core";
import { convertRemToPixels } from "../../utils/numbers";
import { DevTools } from "../dev/DevTools";
import { Footer } from "../layout/footer/Footer";
import { SiteIntro } from "../layout/footer/SiteIntro";
import { Header } from "../layout/header/Header";
import { Overlays } from "../layout/overlays/Overlays";
import { Modals } from "../modals/Modals";
import { pageRegistry } from "../pages/page-registry";
import { Pages } from "../pages/Pages";
import { BarTimerProgress } from "../pages/test/live-stats/BarTimerProgress";
import { Theme } from "./Theme";

export function App(): JSXElement {
  return (
    <QueryClientProvider client={queryClient}>
      <Overlays />
      <div class="customBackground"></div>
      <Theme />
      <BarTimerProgress />
      <div id="solidmodals">
        <Modals />
      </div>
      <div
        id="app"
        class="content-grid focus hidden"
        style={{
          "padding-top": `${getGlobalOffsetTop() + convertRemToPixels(2)}px`,
        }}
      >
        {/* header + page. On the test page this fills the first screen (down
            to #app's 2rem gap), so the intro below starts at the fold */}
        <div
          class="full-width content-grid grid-rows-[auto_1fr] gap-y-8"
          data-ui-element="appTop"
          style={{
            "min-height":
              getActivePage() === "test"
                ? `calc(100vh - ${getGlobalOffsetTop()}px - 4rem)`
                : undefined,
          }}
        >
          <Header />
          <main class="full-width content-grid h-full">
            <Pages registry={pageRegistry} />
          </main>
        </div>
        <SiteIntro />
        <Footer />
      </div>
      <DevTools />
    </QueryClientProvider>
  );
}
