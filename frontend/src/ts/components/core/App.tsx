import { QueryClientProvider } from "@tanstack/solid-query";
import { JSXElement } from "solid-js";

import { queryClient } from "../../queries";
import { getGlobalOffsetTop } from "../../states/core";
import { convertRemToPixels } from "../../utils/numbers";
import { AdRails } from "../ads/AdRails";
import { DevTools } from "../dev/DevTools";
import { Footer } from "../layout/footer/Footer";
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
        <Header />
        <main class="full-width content-grid h-full">
          <Pages registry={pageRegistry} />
        </main>
        <Footer />
        <AdRails />
      </div>
      <DevTools />
    </QueryClientProvider>
  );
}
