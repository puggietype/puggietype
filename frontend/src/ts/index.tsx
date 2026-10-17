// Import sorting is disabled for this file (.oxfmtrc.json): many imports run
// side effects on load, so their order matters.

// register signal tracking hook before any signals are created
import "./dev/signal-tracker";

//enable solidjs-devtools
import "solid-devtools";

import "./event-handlers/global";

import { init } from "./firebase";
import * as Logger from "./utils/logger";
import * as DB from "./db";
import "./ui";
import { Config } from "./config/store";
import * as TestTimer from "./test/test-timer";
import { toggleSmoothedBurst } from "./states/result";
import { onAuthStateChanged } from "./auth";
import "./controllers/route-controller";
import "./elements/no-css";
import "./legacy-states/connection";
import "./test/tts";
import { addToGlobal } from "./utils/misc";
import * as Focus from "./test/focus";
import { getBuildVersion } from "./utils/version";
import * as Cookies from "./cookies";
import "./elements/psa";
import "./controllers/url-handler";
import { applyEngineSettings } from "./anim";
import { qs, qsa, qsr } from "./utils/dom";
import { render } from "solid-js/web";
import { App } from "./components/core/App";
import "./ready";
import { setVersion } from "./states/core";
import { loadFromLocalStorage } from "./config/lifecycle";

import "./input/hotkeys";
import { showModal } from "./states/modals";
import { getLastEventLog } from "./states/test";
import { buildEventLog } from "./test/events/data";

// Lock Math.random
Object.defineProperty(Math, "random", {
  value: Math.random,
  writable: false,
  configurable: false,
  enumerable: true,
});

// Freeze Math object
Object.freeze(Math);

// Lock Math on window
Object.defineProperty(window, "Math", {
  value: Math,
  writable: false,
  configurable: false,
  enumerable: true,
});

if (import.meta.env.DEV) {
  void import("./dev/expose");
}

// pages and the result chart are lazy chunks: after a deploy an open tab can
// ask for chunk hashes that no longer exist. Reload once to pick up the new
// build (at most once a minute, so a truly missing chunk can't loop)
window.addEventListener("vite:preloadError", (event) => {
  const key = "chunkReloadAt";
  const last = Number(sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last < 60_000) return;
  sessionStorage.setItem(key, String(Date.now()));
  event.preventDefault();
  location.reload();
});

// render before anything that might touch component-rendered DOM (eg. test page).
// Renders after the static markup in <body> (index.html)
render(() => <App />, document.body);

applyEngineSettings();
void loadFromLocalStorage();
const buildVersion = getBuildVersion();
if (buildVersion !== null) setVersion(buildVersion);

Focus.set(true, true);
const accepted = Cookies.getAcceptedCookies();
// standalone builds have no backend, so no captcha and nothing to consent to
if (!__STANDALONE__) {
  if (accepted === null) showModal("Cookies");
  const recaptcha = document.createElement("script");
  recaptcha.src = "https://www.google.com/recaptcha/api.js?render=explicit";
  recaptcha.async = true;
  document.body.appendChild(recaptcha);
}
void init(onAuthStateChanged);

addToGlobal({
  snapshot: DB.getSnapshot,
  config: Config,
  glarsesMode: () => {
    console.log("Moved to settings > danger zone > the rest");
  },
  enableTimerDebug: TestTimer.enableTimerDebug,
  getTimerStats: TestTimer.getTimerStats,
  toggleSmoothedBurst,
  toggleDebugLogs: Logger.toggleDebugLogs,
  qs: qs,
  qsa: qsa,
  qsr: qsr,
  lastEventLog: () => getLastEventLog(),
  currentEventLog: buildEventLog,
});
