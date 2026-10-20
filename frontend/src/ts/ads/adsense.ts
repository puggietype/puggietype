import type { AdPrepareOptions, AdProvider, AdSlotSpec } from "./provider";

/**
 * Google AdSense, non-personalized (NPA) with restricted data processing
 * (RDP) on every request. Lives in its own chunk: only imported when both ad
 * switches are on. Order (legal/ads-changeset.md §2):
 *  1. Consent Mode v2 defaults, all denied
 *  2. Google's CMP (Privacy & messaging, TCF v2.3), only from results or idle
 *     non-test pages
 *  3. adsbygoogle.js once the TCF API reports tcloaded/useractioncomplete
 *     (EEA/UK/CH), or on idle where GDPR doesn't apply
 * No auto-refresh: one request per rendered slot.
 */
export const ADSENSE_CLIENT = "ca-pub-8233445679738428";
const PUBLISHER_ID = ADSENSE_CLIENT.replace(/^ca-/, "");
export const ADSENSE_SCRIPT_URL = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
export const CMP_SCRIPT_URL = `https://fundingchoicesmessages.google.com/i/${PUBLISHER_ID}?ers=1`;

/** how long the CMP gets to expose __tcfapi before we give up (no ads) */
const TCF_API_TIMEOUT_MS = 10_000;

type TcData = {
  gdprApplies?: boolean;
  eventStatus?: string;
  listenerId?: number;
};
type TcfApi = (
  command: string,
  version: number,
  callback: (data: TcData, success: boolean) => void,
  parameter?: unknown,
) => void;

type AdsQueue = Record<string, unknown>[] & {
  requestNonPersonalizedAds?: number;
};

type GoogleFc = {
  callbackQueue?: (() => void)[];
  showRevocationMessage?: () => void;
};

export type AdWindow = Window & {
  adsbygoogle?: AdsQueue;
  dataLayer?: unknown[];
  __tcfapi?: TcfApi;
  googlefc?: GoogleFc;
};

export type AdsenseDeps = {
  win: AdWindow;
  loadScript: (url: string) => Promise<void>;
  /** resolves once the main thread is idle */
  idle: () => Promise<void>;
  /** ms between __tcfapi checks */
  pollMs?: number;
  tcfTimeoutMs?: number;
};

/** Consent Mode v2: everything denied until the CMP says otherwise */
export function setConsentDefaults(win: AdWindow): void {
  const dataLayer = (win.dataLayer ??= []);
  // the gtag() shape: consent mode only reads Arguments objects
  function gtag(..._args: unknown[]): void {
    // oxlint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  }
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
}

/** lets the Privacy & messaging tag know the site loaded it on purpose */
function signalGooglefcPresent(win: AdWindow): void {
  const doc = win.document;
  if (doc.querySelector("iframe[name='googlefcPresent']") !== null) return;
  const iframe = doc.createElement("iframe");
  iframe.name = "googlefcPresent";
  iframe.style.display = "none";
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  doc.body.appendChild(iframe);
}

/**
 * Resolves true once ads may load: GDPR doesn't apply, or the user finished
 * with the consent message (tcloaded/useractioncomplete). False if the CMP
 * never exposes the TCF API (blocked, not configured): fail closed.
 */
export async function waitForTcfConsent(
  win: AdWindow,
  pollMs: number,
  timeoutMs: number,
): Promise<{ ok: boolean; gdprApplies: boolean }> {
  const until = Date.now() + timeoutMs;
  while (win.__tcfapi === undefined) {
    if (Date.now() >= until) return { ok: false, gdprApplies: true };
    await new Promise((r) => setTimeout(r, pollMs));
  }
  const tcfapi = win.__tcfapi;
  return new Promise((resolve) => {
    tcfapi("addEventListener", 2, (data, success) => {
      if (!success) return;
      const done =
        data.gdprApplies === false ||
        data.eventStatus === "tcloaded" ||
        data.eventStatus === "useractioncomplete";
      if (!done) return;
      if (data.listenerId !== undefined) {
        tcfapi("removeEventListener", 2, () => undefined, data.listenerId);
      }
      resolve({ ok: true, gdprApplies: data.gdprApplies !== false });
    });
  });
}

/** NPA for every request: set on the queue before the script and each push */
function adsQueue(win: AdWindow): AdsQueue {
  const queue = (win.adsbygoogle ??= [] as AdsQueue);
  queue.requestNonPersonalizedAds = 1;
  return queue;
}

export function createAdsenseProvider(deps: AdsenseDeps): AdProvider {
  const { win } = deps;
  const pollMs = deps.pollMs ?? 100;
  const tcfTimeoutMs = deps.tcfTimeoutMs ?? TCF_API_TIMEOUT_MS;
  let cmpPromise: Promise<void> | undefined;
  let preparePromise: Promise<boolean> | undefined;

  const loadCmp = async (): Promise<void> => {
    cmpPromise ??= (async () => {
      setConsentDefaults(win);
      signalGooglefcPresent(win);
      await deps.loadScript(CMP_SCRIPT_URL);
    })();
    return cmpPromise;
  };

  const prepareOnce = async (): Promise<boolean> => {
    try {
      await loadCmp();
      const consent = await waitForTcfConsent(win, pollMs, tcfTimeoutMs);
      if (!consent.ok) return false;
      if (!consent.gdprApplies) await deps.idle();
      adsQueue(win);
      await deps.loadScript(ADSENSE_SCRIPT_URL);
      return true;
    } catch {
      return false;
    }
  };

  return {
    name: "adsense",
    prepare: async (options: AdPrepareOptions): Promise<boolean> => {
      // the test page never loads the CMP, it can only reuse a prepare
      if (!options.consentUi) return preparePromise ?? false;
      preparePromise ??= prepareOnce();
      return preparePromise;
    },
    render: (slot: HTMLElement, spec: AdSlotSpec): void => {
      if (slot.childElementCount > 0) return;
      const ins = win.document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "inline-block";
      ins.style.width = `${spec.width}px`;
      ins.style.height = `${spec.height}px`;
      ins.dataset["adClient"] = ADSENSE_CLIENT;
      ins.dataset["adSlot"] = spec.slotId;
      // RDP for everyone (legal/ads-changeset.md §2, US row)
      ins.dataset["restrictDataProcessing"] = "1";
      slot.appendChild(ins);
      try {
        adsQueue(win).push({});
      } catch {
        // a failed request leaves the reserved box empty
      }
    },
    destroy: (slot: HTMLElement): void => {
      slot.replaceChildren();
    },
    openPrivacySettings: (): void => {
      const fc = (win.googlefc ??= {});
      (fc.callbackQueue ??= []).push(() => {
        win.googlefc?.showRevocationMessage?.();
      });
      void loadCmp().catch(() => undefined);
    },
  };
}

async function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = url;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${url}`));
    document.head.appendChild(script);
  });
}

async function idle(): Promise<void> {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => resolve(), { timeout: 2000 });
    } else {
      setTimeout(resolve, 200);
    }
  });
}

export const adsenseProvider: AdProvider = createAdsenseProvider({
  win: window,
  loadScript,
  idle,
});
