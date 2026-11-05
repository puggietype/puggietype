import {
  type ConsentRecord,
  globalPrivacyControl,
  readConsentRecord,
  writeConsentRecord,
} from "./consent";
import { syncGa4 } from "./ga4";

const BANNER_ID = "pt-consent-banner";

function draft(): { analytics: boolean; doNotSellOrShare: boolean } {
  const stored = readConsentRecord();
  const gpc = globalPrivacyControl();
  return {
    analytics: stored?.analytics ?? false,
    doNotSellOrShare: gpc || (stored?.doNotSellOrShare ?? false),
  };
}

function closeBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
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
  const initial = draft();
  const root = document.createElement("div");
  root.id = BANNER_ID;
  root.className = "consentBanner";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-labelledby", "pt-consent-title");

  const title = document.createElement("h2");
  title.id = "pt-consent-title";
  title.textContent = "Privacy and cookie settings";

  const copy = document.createElement("p");
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
  reject.className = "consentReject";
  reject.textContent = "Reject analytics";
  reject.addEventListener("click", () => {
    save(false, true);
  });
  actions.append(accept, reject);
  root.append(title, copy, sale, actions);
  document.body.append(root);
}

export function bootStaticConsent(): void {
  const button = document.querySelector("[data-consent-settings]");
  button?.addEventListener("click", () => {
    openBanner();
  });
  if (readConsentRecord() === null) openBanner();
  syncGa4();
}

bootStaticConsent();
