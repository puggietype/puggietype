import {
  type ConsentRecord,
  globalPrivacyControl,
  noteKidsFlowVisit,
  readConsentRecord,
  writeConsentRecord,
} from "./consent";
import { syncGa4 } from "./ga4";

const BANNER_ID = "pt-consent-banner";

let restoreFocus: HTMLElement | null = null;

function draft(): { analytics: boolean; doNotSellOrShare: boolean } {
  const stored = readConsentRecord();
  const gpc = globalPrivacyControl();
  return {
    analytics: stored?.analytics ?? false,
    doNotSellOrShare: gpc || (stored?.doNotSellOrShare ?? false),
  };
}

function onBannerKey(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  if (document.getElementById(BANNER_ID) === null) return;
  event.preventDefault();
  save(false, true);
}

function closeBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
  document.removeEventListener("keydown", onBannerKey);
  const back = restoreFocus;
  restoreFocus = null;
  if (back?.isConnected) back.focus();
}

function save(analytics: boolean, doNotSellOrShare: boolean): void {
  const record: ConsentRecord = {
    security: true,
    analytics,
    doNotSellOrShare: globalPrivacyControl() ? true : doNotSellOrShare,
  };
  writeConsentRecord(record);
  closeBanner();
  syncGa4();
}

function openBanner(): void {
  if (document.getElementById(BANNER_ID) !== null) return;
  const previous = document.activeElement;
  restoreFocus =
    previous instanceof HTMLElement && previous !== document.body
      ? previous
      : null;
  const initial = draft();
  const root = document.createElement("div");
  root.id = BANNER_ID;
  root.className = "consentBanner";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "false");
  root.setAttribute("aria-labelledby", "pt-consent-title");
  root.setAttribute("aria-describedby", "pt-consent-copy");

  const title = document.createElement("h2");
  title.id = "pt-consent-title";
  title.textContent = "Privacy and cookie settings";

  const copy = document.createElement("p");
  copy.id = "pt-consent-copy";
  copy.textContent =
    "Google Analytics 4 is optional and helps us understand site traffic. We do not load advertising scripts. Where consent is required, Google Analytics 4 does not run until you accept. Rejecting means it never loads.";

  const sale = document.createElement("label");
  const saleInput = document.createElement("input");
  saleInput.type = "checkbox";
  saleInput.checked = initial.doNotSellOrShare;
  saleInput.disabled = globalPrivacyControl();
  const saleText = document.createElement("span");
  saleText.textContent =
    "Do Not Sell or Share. Advertising purposes stay off. This preference is saved for later.";
  sale.append(saleInput, saleText);

  const actions = document.createElement("div");
  actions.className = "consentActions";
  const accept = document.createElement("button");
  accept.type = "button";
  accept.textContent = "Accept analytics";
  accept.addEventListener("click", () => {
    save(true, saleInput.checked);
  });
  const reject = document.createElement("button");
  reject.type = "button";
  reject.textContent = "Reject analytics";
  reject.addEventListener("click", () => {
    save(false, true);
  });
  actions.append(accept, reject);
  root.append(title, copy, actions, sale);
  document.body.append(root);
  document.addEventListener("keydown", onBannerKey);
  accept.focus();
}

export function bootStaticConsent(): void {
  const kidsFlow = noteKidsFlowVisit({
    pathname: window.location.pathname,
    referrer: document.referrer,
    storage: sessionStorage,
  });
  if (kidsFlow) return;
  // querySelector is wrong in happy-dom for this attribute (returns a detached
  // div). querySelectorAll finds the real footer button in browsers and tests.
  const button = [...document.querySelectorAll("[data-consent-settings]")].find(
    (node) => node.tagName === "BUTTON",
  );
  button?.addEventListener("click", () => {
    openBanner();
  });
  if (readConsentRecord() === null) openBanner();
  syncGa4();
}

bootStaticConsent();
