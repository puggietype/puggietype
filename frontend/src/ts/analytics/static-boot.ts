import {
  CONSENT_ESSENTIAL_COPY,
  type ConsentRecord,
  globalPrivacyControl,
  noteKidsFlowVisit,
  readConsentRecord,
  pinToVisualBottom,
  visibleViewportHeight,
  writeConsentRecord,
} from "./consent";
import { syncGa4 } from "./ga4";

const BANNER_ID = "pt-consent-banner";

let restoreFocus: HTMLElement | null = null;
let releaseNeutralFocus: (() => void) | null = null;

/**
 * Keep Space/Enter from landing on Accept. A later Tab or click inside the
 * bar is the user choosing a control, and that focus stays.
 */
function holdNeutralBannerFocus(root: HTMLElement): () => void {
  let userInside = false;
  const settle = (): void => {
    if (userInside) {
      return;
    }
    const active = document.activeElement;
    if (active === root) {
      return;
    }
    if (active instanceof Node && root.contains(active)) {
      root.focus();
    }
  };
  const onFocusIn = (): void => {
    settle();
  };
  const onPointerDown = (event: Event): void => {
    if (event.target instanceof Node && root.contains(event.target)) {
      userInside = true;
    }
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Tab") {
      userInside = true;
    }
  };
  root.tabIndex = -1;
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  root.focus();
  requestAnimationFrame(settle);
  return () => {
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}

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

function fitStaticBanner(): void {
  const banner = document.getElementById(BANNER_ID);
  if (banner === null) return;
  const limit = visibleViewportHeight();
  banner.style.maxHeight = `${limit}px`;
  banner.style.overflowY = "auto";
  pinToVisualBottom(banner);
  const height = Math.ceil(banner.getBoundingClientRect().height);
  if (height <= 0) return;
  document.documentElement.style.setProperty(
    "--consent-banner-block",
    `${Math.min(height, limit)}px`,
  );
}

function closeBanner(): void {
  releaseNeutralFocus?.();
  releaseNeutralFocus = null;
  document.getElementById(BANNER_ID)?.remove();
  document.removeEventListener("keydown", onBannerKey);
  window.removeEventListener("resize", fitStaticBanner);
  window.visualViewport?.removeEventListener("resize", fitStaticBanner);
  window.visualViewport?.removeEventListener("scroll", fitStaticBanner);
  document.documentElement.style.removeProperty("--consent-banner-block");
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
  copy.append(document.createTextNode(`${CONSENT_ESSENTIAL_COPY} `));
  const policy = document.createElement("a");
  policy.href = "/privacy";
  policy.textContent = "Privacy policy";
  copy.append(policy);

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
  window.addEventListener("resize", fitStaticBanner);
  window.visualViewport?.addEventListener("resize", fitStaticBanner);
  window.visualViewport?.addEventListener("scroll", fitStaticBanner);
  fitStaticBanner();
  releaseNeutralFocus = holdNeutralBannerFocus(root);
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
