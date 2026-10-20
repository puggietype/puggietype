import { describe, expect, it, vi } from "vitest";

import {
  ADSENSE_CLIENT,
  ADSENSE_SCRIPT_URL,
  AdWindow,
  CMP_SCRIPT_URL,
  createAdsenseProvider,
  setConsentDefaults,
} from "../../src/ts/ads/adsense";

type TcfCallback = (
  data: { gdprApplies?: boolean; eventStatus?: string; listenerId?: number },
  success: boolean,
) => void;

/** a window whose CMP answers with `events` once its script "loads" */
type Setup = {
  win: AdWindow;
  provider: ReturnType<typeof createAdsenseProvider>;
  loaded: string[];
  idle: ReturnType<typeof vi.fn>;
  decide: (data: Parameters<TcfCallback>[0]) => void;
};

function setup(events: Parameters<TcfCallback>[0][] | "never"): Setup {
  const win = window as AdWindow;
  delete win.adsbygoogle;
  delete win.__tcfapi;
  delete win.googlefc;
  win.dataLayer = [];
  let consentCallback: TcfCallback | undefined;
  const loaded: string[] = [];
  const loadScript = vi.fn(async (url: string) => {
    loaded.push(url);
    if (url === CMP_SCRIPT_URL && events !== "never") {
      win.__tcfapi = (command, _version, callback) => {
        if (command !== "addEventListener") return;
        consentCallback = callback;
        for (const data of events) callback(data, true);
      };
    }
  });
  const idle = vi.fn(async () => Promise.resolve());
  const provider = createAdsenseProvider({
    win,
    loadScript,
    idle,
    pollMs: 1,
    tcfTimeoutMs: 50,
  });
  return {
    win,
    provider,
    loaded,
    idle,
    decide: (data: Parameters<TcfCallback>[0]) => consentCallback?.(data, true),
  };
}

const spec = {
  kind: "result" as const,
  width: 728,
  height: 90,
  slotId: "PLACEHOLDER_SLOT_RESULT",
};

describe("adsense provider", () => {
  it("sets all Consent Mode v2 defaults to denied", () => {
    const win = { dataLayer: [] } as unknown as AdWindow;
    setConsentDefaults(win);
    const entry = win.dataLayer?.[0] as IArguments;
    expect([...(entry as unknown as unknown[])]).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
  });

  it("loads nothing until prepare() is called", () => {
    const { loaded } = setup([{ gdprApplies: false, eventStatus: "tcloaded" }]);
    expect(loaded).toEqual([]);
  });

  it("never loads the CMP from the test page (consentUi false)", async () => {
    const { provider, loaded } = setup([{ gdprApplies: false }]);
    expect(await provider.prepare({ consentUi: false })).toBe(false);
    expect(loaded).toEqual([]);
  });

  it("outside GDPR: consent defaults, CMP, idle, then the ad script with NPA", async () => {
    const { provider, loaded, idle, win } = setup([
      { gdprApplies: false, eventStatus: "tcloaded" },
    ]);
    expect(await provider.prepare({ consentUi: true })).toBe(true);
    expect(loaded).toEqual([CMP_SCRIPT_URL, ADSENSE_SCRIPT_URL]);
    expect(idle).toHaveBeenCalledOnce();
    expect(win.dataLayer).toHaveLength(1);
    expect(win.adsbygoogle?.requestNonPersonalizedAds).toBe(1);
    expect(ADSENSE_SCRIPT_URL).toBe(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8233445679738428",
    );
  });

  it("EEA/UK/CH: no ad script until the user finishes with the message", async () => {
    const { provider, loaded, decide } = setup([
      { gdprApplies: true, eventStatus: "cmpuishown", listenerId: 1 },
    ]);
    const prepared = provider.prepare({ consentUi: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(loaded).toEqual([CMP_SCRIPT_URL]);
    decide({
      gdprApplies: true,
      eventStatus: "useractioncomplete",
      listenerId: 1,
    });
    expect(await prepared).toBe(true);
    expect(loaded).toEqual([CMP_SCRIPT_URL, ADSENSE_SCRIPT_URL]);
  });

  it("EEA/UK/CH with a stored choice (tcloaded) loads right away", async () => {
    const { provider, loaded, idle } = setup([
      { gdprApplies: true, eventStatus: "tcloaded" },
    ]);
    expect(await provider.prepare({ consentUi: true })).toBe(true);
    expect(loaded).toEqual([CMP_SCRIPT_URL, ADSENSE_SCRIPT_URL]);
    expect(idle).not.toHaveBeenCalled();
  });

  it("fails closed when the CMP never exposes the TCF API", async () => {
    const { provider, loaded } = setup("never");
    expect(await provider.prepare({ consentUi: true })).toBe(false);
    expect(loaded).toEqual([CMP_SCRIPT_URL]);
  });

  it("caches the prepare: scripts load once, test page reuses it", async () => {
    const { provider, loaded } = setup([{ gdprApplies: false }]);
    await provider.prepare({ consentUi: true });
    await provider.prepare({ consentUi: true });
    expect(await provider.prepare({ consentUi: false })).toBe(true);
    expect(loaded).toEqual([CMP_SCRIPT_URL, ADSENSE_SCRIPT_URL]);
  });

  it("renders one fixed-size unit with RDP and NPA on the request", () => {
    const { provider, win } = setup([]);
    const slot = document.createElement("div");
    provider.render(slot, spec);
    const ins = slot.querySelector("ins.adsbygoogle") as HTMLElement;
    expect(ins.dataset["adClient"]).toBe(ADSENSE_CLIENT);
    expect(ins.dataset["adSlot"]).toBe("PLACEHOLDER_SLOT_RESULT");
    expect(ins.getAttribute("data-restrict-data-processing")).toBe("1");
    expect(ins.style.width).toBe("728px");
    expect(ins.style.height).toBe("90px");
    expect(ins.hasAttribute("data-ad-format")).toBe(false);
    expect(win.adsbygoogle).toHaveLength(1);
    expect(win.adsbygoogle?.requestNonPersonalizedAds).toBe(1);
  });

  it("never requests a second ad into a filled slot (no refresh)", () => {
    const { provider, win } = setup([]);
    const slot = document.createElement("div");
    provider.render(slot, spec);
    provider.render(slot, spec);
    expect(slot.querySelectorAll("ins")).toHaveLength(1);
    expect(win.adsbygoogle).toHaveLength(1);
  });

  it("destroy empties the slot", () => {
    const { provider } = setup([]);
    const slot = document.createElement("div");
    provider.render(slot, spec);
    provider.destroy(slot);
    expect(slot.childNodes).toHaveLength(0);
  });

  it("privacy settings reopen the consent message", async () => {
    const { provider, win, loaded } = setup([]);
    provider.openPrivacySettings();
    await Promise.resolve();
    expect(loaded).toEqual([CMP_SCRIPT_URL]);
    const show = vi.fn();
    win.googlefc = { ...win.googlefc, showRevocationMessage: show };
    for (const cb of win.googlefc.callbackQueue ?? []) cb();
    expect(show).toHaveBeenCalledOnce();
  });
});
