import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  ga4MeasurementId: "",
}));

const recorded = vi.hoisted(() => {
  const calls: string[] = [];
  const xhrSends: string[] = [];
  const urlOf = (input: unknown): string => {
    if (typeof input === "string") return input;
    if (typeof URL !== "undefined" && input instanceof URL) return input.href;
    if (typeof Request !== "undefined" && input instanceof Request) {
      return input.url;
    }
    return "";
  };
  if (typeof window !== "undefined") {
    window.fetch = async (input: RequestInfo | URL) => {
      calls.push(urlOf(input));
      return new Response("forwarded", { status: 204 });
    };
    navigator.sendBeacon = ((url: string | URL) => {
      calls.push(`beacon:${urlOf(url)}`);
      return true;
    }) as typeof navigator.sendBeacon;
    XMLHttpRequest.prototype.send = function (): void {
      xhrSends.push("sent");
    };
  }
  return { calls, xhrSends };
});

vi.mock("virtual:env-config", () => ({
  envConfig: env,
}));

import {
  adsAllowedOnPath,
  adsEnabled,
  isAdsExcludedPath,
} from "../../src/ts/ads/excluded-paths";
import {
  GA4_COOKIE_EXPIRES_SECONDS,
  GA4_SCRIPT_URL,
  gaDisableKey,
  gaTransportDropCount,
  isGaTransportBlocked,
  loadGa4,
  onSpaRouteChange,
  syncGa4,
} from "../../src/ts/analytics/ga4";
import {
  analyticsLoadAllowed,
  consentBannerAllowed,
  deleteGaCookies,
  gaCookieExpiryLines,
  kidsAnalyticsExcluded,
  KIDS_FLOW_STORAGE_KEY,
  noteKidsFlowVisit,
  readConsentRecord,
  readKidsFlow,
  writeConsentRecord,
} from "../../src/ts/analytics/consent";
import { ga4CspSources } from "../../vite-plugins/ga4-csp";
import { injectStaticConsentScript } from "../../vite-plugins/static-consent-script";

const src = path.resolve(__dirname, "../../src");

const FAQ_INTERIM =
  'PuggieType may load Google Analytics 4 so we can understand site traffic. We also see aggregate traffic totals from our host, Cloudflare. Solo test data stays in your browser, except a leaderboard score you choose to submit and the average speed plus a random Quick Match ID sent when you join Quick Match. The <a href="/privacy">privacy policy</a> explains what is collected and for how long.';

const ABOUT =
  "We use privacy-preserving aggregate traffic tools from our host (Cloudflare) and, when enabled, Google Analytics 4. Details are in our";

describe("GA collect transport gate", () => {
  const id = "G-TEST1234";
  const savedFetch = window.fetch;
  const savedBeacon = navigator.sendBeacon.bind(navigator);

  beforeEach(() => {
    env.ga4MeasurementId = id;
    writeConsentRecord(ACCEPTED);
  });

  afterEach(() => {
    writeConsentRecord(ACCEPTED);
    env.ga4MeasurementId = "";
  });

  function withdraw(): void {
    writeConsentRecord(REJECTED);
  }

  async function expectFetchBlocked(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<void> {
    const before = gaTransportDropCount();
    const response = await window.fetch(input, init);
    expect(await response.text()).toBe("ga-transport-blocked");
    expect(gaTransportDropCount()).toBe(before + 1);
  }

  function expectNotDropped(run: () => void): void {
    const before = gaTransportDropCount();
    run();
    expect(gaTransportDropCount()).toBe(before);
  }

  async function expectFetchForwarded(url: string): Promise<void> {
    const beforeDrops = gaTransportDropCount();
    const beforeCalls = recorded.calls.length;
    const response = await window.fetch(url);
    expect(await response.text()).toBe("forwarded");
    expect(recorded.calls.slice(beforeCalls)).toContain(url);
    expect(gaTransportDropCount()).toBe(beforeDrops);
  }

  async function expectBlocked(url: string): Promise<void> {
    const callsBefore = recorded.calls.length;
    const xhrBefore = recorded.xhrSends.length;
    await expectFetchBlocked(url);
    await expectFetchBlocked(new URL(url));
    await expectFetchBlocked(new Request(url));
    const beforeBeacon = gaTransportDropCount();
    expect(navigator.sendBeacon(url)).toBe(true);
    expect(gaTransportDropCount()).toBe(beforeBeacon + 1);
    const img = new Image();
    const beforeImg = gaTransportDropCount();
    img.src = url;
    expect(img.src).not.toContain(new URL(url).hostname);
    expect(gaTransportDropCount()).toBe(beforeImg + 1);
    const xhr = new XMLHttpRequest();
    const beforeXhr = gaTransportDropCount();
    xhr.open("POST", url);
    xhr.send();
    expect(gaTransportDropCount()).toBe(beforeXhr + 1);
    expect(recorded.calls.length).toBe(callsBefore);
    expect(recorded.xhrSends.length).toBe(xhrBefore);
  }

  async function expectPassed(url: string): Promise<void> {
    await expectFetchForwarded(url);
    const beforeCalls = recorded.calls.length;
    const beforeXhr = recorded.xhrSends.length;
    expectNotDropped(() => {
      expect(navigator.sendBeacon(url)).toBe(true);
      const img = new Image();
      img.src = url;
      expect(img.src).toContain(new URL(url).hostname);
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url);
      xhr.send();
    });
    expect(recorded.calls.slice(beforeCalls)).toContain(`beacon:${url}`);
    expect(recorded.xhrSends.length).toBe(beforeXhr + 1);
  }

  it("drops queued collect transports after withdraw and lets them through again", async () => {
    withdraw();
    expect(isGaTransportBlocked()).toBe(true);
    await expectBlocked("https://www.google-analytics.com/g/collect?cid=GA1.1");
    await expectBlocked("https://region1.google-analytics.com/g/collect?v=2");
    await expectBlocked("https://region1.analytics.google.com/g/collect");
    await expectBlocked("https://www.googletagmanager.com/g/collect");
    await expectBlocked("https://stats.g.doubleclick.net/g/collect");
    await expectBlocked("https://www.googleadservices.com/pagead/conversion");
    await expectBlocked(
      "https://pagead2.googlesyndication.com/pagead/viewthroughconversion",
    );
    await expectBlocked("https://www.google.com/g/collect");
    await expectBlocked("https://www.google.com/ccm/collect");
    await expectBlocked("https://www.google.co.uk/pagead/1p-conversion");
    await expectBlocked("https://google.de/ads/ga-audiences");
    writeConsentRecord(ACCEPTED);
    expect(isGaTransportBlocked()).toBe(false);
    await expectPassed("https://www.google-analytics.com/g/collect?cid=1");
  });

  it("does not throw when sendBeacon is missing", async () => {
    const desc = Object.getOwnPropertyDescriptor(navigator, "sendBeacon");
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    vi.resetModules();
    const consent = await import("../../src/ts/analytics/consent");
    await import("../../src/ts/analytics/ga4");
    expect(() => {
      consent.writeConsentRecord(ACCEPTED);
    }).not.toThrow();
    expect(() => {
      consent.writeConsentRecord(REJECTED);
    }).not.toThrow();
    consent.writeConsentRecord(ACCEPTED);
    if (desc !== undefined) {
      Object.defineProperty(navigator, "sendBeacon", desc);
    }
    window.fetch = savedFetch;
  });

  it("lets unrelated hosts and non-collect google URLs through while withdrawn", async () => {
    withdraw();
    const allowed = [
      "https://fonts.gstatic.com/s/roboto/v30/roboto.woff2",
      "https://www.googleapis.com/discovery/v1/apis",
      "https://poetrydb.org/random",
      "https://en.wikipedia.org/api/rest_v1/page/summary/Pug",
      "https://de.wikipedia.org/wiki/Mops",
      "https://cdn.example.com/walls/custom-background.jpg",
      "https://www.google.com/search?q=puggietype",
      "https://www.google.com/images/branding/googlelogo.png",
    ];
    for (const url of allowed) {
      await expectPassed(url);
    }
  });

  it("blocks setAttribute src and srcset, and script src, except GET /gtag/js", () => {
    withdraw();
    const collect = "https://www.google-analytics.com/g/collect";
    const img = document.createElement("img");
    const before = gaTransportDropCount();
    img.setAttribute("src", collect);
    img.setAttribute("SRC", collect);
    img.setAttributeNS(null, "src", collect);
    img.srcset = `${collect} 1x, https://cdn.example.com/ok.png 2x`;
    img.setAttribute("srcset", `${collect} 1x`);
    expect(img.getAttribute("src")).toBeNull();
    expect(img.getAttribute("srcset")).toBeNull();
    expect(gaTransportDropCount()).toBe(before + 5);

    const script = document.createElement("script");
    const beforeScript = gaTransportDropCount();
    script.src = collect;
    script.setAttribute("src", collect);
    expect(script.getAttribute("src")).toBeNull();
    expect(gaTransportDropCount()).toBe(beforeScript + 2);

    const gtag = "https://www.googletagmanager.com/gtag/js?id=G-TEST1234";
    expectNotDropped(() => {
      script.src = gtag;
    });
    expect(script.src).toContain("/gtag/js");
    expectNotDropped(() => {
      script.setAttribute("src", gtag);
    });
    expect(script.getAttribute("src")).toContain("/gtag/js");
  });

  it("still allows a GET of /gtag/js while withdrawn and blocks other uses", async () => {
    withdraw();
    const gtag = "https://www.googletagmanager.com/gtag/js?id=G-TEST1234";
    await expectFetchForwarded(gtag);
    const beforeXhr = recorded.xhrSends.length;
    expectNotDropped(() => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", gtag);
      xhr.send();
    });
    expect(recorded.xhrSends.length).toBe(beforeXhr + 1);
    const before = gaTransportDropCount();
    expect(navigator.sendBeacon(gtag)).toBe(true);
    const img = new Image();
    img.src = gtag;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", gtag);
    xhr.send();
    expect(img.src).not.toContain("googletagmanager.com");
    expect(gaTransportDropCount()).toBe(before + 3);
  });

  it("blocks fetch and sendBeacon references saved before withdraw", async () => {
    withdraw();
    const response = await savedFetch(
      "https://www.google-analytics.com/g/collect",
    );
    expect(await response.text()).toBe("ga-transport-blocked");
    const before = gaTransportDropCount();
    expect(savedBeacon("https://www.google-analytics.com/g/collect")).toBe(
      true,
    );
    expect(gaTransportDropCount()).toBe(before + 1);
    writeConsentRecord(ACCEPTED);
    await expectFetchForwarded("https://www.google-analytics.com/g/collect");
  });

  it("blocks every path on analytics and ads hosts", async () => {
    withdraw();
    await expectBlocked("https://www.google-analytics.com/favicon.ico");
    await expectBlocked("https://region1.analytics.google.com/g/collect");
    await expectBlocked("https://stats.g.doubleclick.net/pixel");
    await expectBlocked("https://www.googleadservices.com/pagead/conversion");
    await expectBlocked(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
    );
    await expectBlocked("https://www.googletagmanager.com/gtm.js?id=GTM-TEST");
  });

  it("blocks double-slash, mp, legacy collect, and td paths", async () => {
    withdraw();
    await expectBlocked("https://www.google-analytics.com//g/collect");
    await expectBlocked("https://www.google-analytics.com/mp/collect");
    await expectBlocked("https://www.google-analytics.com/collect");
    await expectBlocked("https://www.google-analytics.com/td");
    await expectBlocked("https://www.google.com//g/collect");
    await expectBlocked("https://www.google.com/mp/collect");
    await expectBlocked("https://www.google.com/collect");
    await expectBlocked("https://www.google.com/td");
  });

  it("does not block non-Google setAttribute, or Google URLs while consent is on", () => {
    const img = document.createElement("img");
    expectNotDropped(() => {
      img.setAttribute("src", "https://www.google-analytics.com/g/collect");
    });
    expect(img.getAttribute("src")).toContain("google-analytics.com");
    withdraw();
    const plain = document.createElement("img");
    expectNotDropped(() => {
      plain.setAttribute(
        "src",
        "https://cdn.example.com/walls/custom-background.jpg",
      );
      plain.setAttribute(
        "srcset",
        "https://cdn.example.com/walls/custom-background.jpg 1x",
      );
    });
    expect(plain.getAttribute("src")).toContain("cdn.example.com");
    expect(plain.getAttribute("srcset")).toContain("cdn.example.com");
  });
});

describe("analytics consent gate", () => {
  it("does not keep a country-cookie reader", () => {
    const consent = readFileSync(
      path.join(src, "ts/analytics/consent.ts"),
      "utf8",
    );
    const middleware = readFileSync(
      path.resolve(__dirname, "../../../functions/_middleware.ts"),
      "utf8",
    );
    expect(consent).not.toContain("pt_country");
    expect(consent).not.toContain("readCountryCookie");
    expect(consent).not.toContain("DEFAULT_CONSENT_REGIONS");
    expect(middleware).not.toContain("pt_country");
    expect(middleware).not.toContain("Set-Cookie");
  });

  it("loads GA4 only after accept, including in the US", () => {
    expect(
      analyticsLoadAllowed({
        measurementId: "",
        analytics: true,
        kidsExcluded: false,
      }),
    ).toBe(false);
    expect(
      analyticsLoadAllowed({
        measurementId: "G-TEST1234",
        analytics: null,
        kidsExcluded: false,
      }),
    ).toBe(false);
    expect(
      analyticsLoadAllowed({
        measurementId: "G-TEST1234",
        analytics: false,
        kidsExcluded: false,
      }),
    ).toBe(false);
    expect(
      analyticsLoadAllowed({
        measurementId: "G-TEST1234",
        analytics: true,
        kidsExcluded: false,
      }),
    ).toBe(true);
  });

  it("never loads GA4 on kids paths or kids-flow, whatever the choice", () => {
    const paths = [
      "/guide/typing-for-kids",
      "/guide/typing-for-kids/",
      "/guide/teaching-kids-to-type",
      "/guide/teaching-kids-to-type/",
    ];
    for (const pathname of paths) {
      for (const analytics of [true, false, null] as const) {
        expect(
          analyticsLoadAllowed({
            measurementId: "G-TEST1234",
            analytics,
            kidsExcluded: kidsAnalyticsExcluded({ pathname }),
          }),
        ).toBe(false);
      }
    }
    expect(
      kidsAnalyticsExcluded({
        pathname: "/",
        referrer: "https://puggietype.com/guide/teaching-kids-to-type/",
      }),
    ).toBe(true);
    expect(kidsAnalyticsExcluded({ pathname: "/faq", kidsFlow: true })).toBe(
      true,
    );
    expect(kidsAnalyticsExcluded({ pathname: "/faq" })).toBe(false);

    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string): string | null => memory.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        memory.set(key, value);
      },
    };
    expect(
      noteKidsFlowVisit({
        pathname: "/guide/teaching-kids-to-type/",
        storage,
      }),
    ).toBe(true);
    expect(readKidsFlow(storage)).toBe(true);
    for (const pathname of ["/", "/privacy", "/guide/typing-tips"]) {
      expect(
        analyticsLoadAllowed({
          measurementId: "G-TEST1234",
          analytics: true,
          kidsExcluded: kidsAnalyticsExcluded({
            pathname,
            kidsFlow: readKidsFlow(storage),
          }),
        }),
        pathname,
      ).toBe(false);
    }
    const later = new Map<string, string>();
    const fromHome = {
      getItem: (key: string): string | null => later.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        later.set(key, value);
      },
    };
    expect(
      noteKidsFlowVisit({
        pathname: "/",
        referrer: "https://puggietype.com/guide/typing-for-kids",
        storage: fromHome,
      }),
    ).toBe(true);
    expect(
      kidsAnalyticsExcluded({
        pathname: "/privacy",
        kidsFlow: readKidsFlow(fromHome),
      }),
    ).toBe(true);
    // Same session, later SPA or typed navigation, referrer already gone.
    expect(
      noteKidsFlowVisit({
        pathname: "/privacy",
        referrer: "",
        storage: fromHome,
      }),
    ).toBe(true);
    // A new tab does not share sessionStorage. No kids referrer means no kids-flow.
    const newTab = new Map<string, string>();
    const newTabStorage = {
      getItem: (key: string): string | null => newTab.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        newTab.set(key, value);
      },
    };
    expect(
      noteKidsFlowVisit({
        pathname: "/",
        referrer: "",
        storage: newTabStorage,
      }),
    ).toBe(false);
    expect(
      analyticsLoadAllowed({
        measurementId: "G-TEST1234",
        analytics: null,
        kidsExcluded: kidsAnalyticsExcluded({
          pathname: "/",
          kidsFlow: readKidsFlow(newTabStorage),
        }),
      }),
    ).toBe(false);
    const leaderboards = readFileSync(
      path.join(src, "ts/multiplayer/leaderboards.ts"),
      "utf8",
    );
    expect(leaderboards).toContain(
      `export const KIDS_FLOW_KEY = "${KIDS_FLOW_STORAGE_KEY}"`,
    );
  });

  it("hides the banner during a test or race", () => {
    expect(consentBannerAllowed({ testActive: false, raceActive: false })).toBe(
      true,
    );
    expect(consentBannerAllowed({ testActive: true, raceActive: false })).toBe(
      false,
    );
    expect(consentBannerAllowed({ testActive: false, raceActive: true })).toBe(
      false,
    );
  });

  it("replaces an old security-only cookie choice", () => {
    localStorage.setItem("acceptedCookies", JSON.stringify({ security: true }));
    expect(readConsentRecord()).toBeNull();
    writeConsentRecord({
      security: true,
      analytics: false,
      doNotSellOrShare: true,
    });
    expect(readConsentRecord()).toEqual({
      security: true,
      analytics: false,
      doNotSellOrShare: true,
    });
  });

  it("loads GA4 once, with signals and ads personalization off", () => {
    const scripts: HTMLScriptElement[] = [];
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) scripts.push(node);
      return node;
    });
    try {
      loadGa4("");
      loadGa4("UA-1");
      expect(scripts).toHaveLength(0);
      loadGa4("G-TEST1234");
      loadGa4("G-TEST1234");
      expect(scripts).toHaveLength(1);
      expect(scripts[0]?.getAttribute("src")).toBe(
        `${GA4_SCRIPT_URL}?id=G-TEST1234`,
      );
      const layer = JSON.stringify(
        (window as Window & { dataLayer?: unknown[] }).dataLayer,
      );
      const deniedAt = layer.indexOf('"analytics_storage":"denied"');
      const grantedAt = layer.indexOf('"analytics_storage":"granted"');
      expect(deniedAt).toBeGreaterThan(-1);
      expect(grantedAt).toBeGreaterThan(deniedAt);
      expect(layer).toContain('"allow_google_signals":false');
      expect(layer).toContain('"allow_ad_personalization_signals":false');
      expect(layer).toContain('"ad_personalization":"denied"');
      expect(layer).toContain(`"cookie_expires":${GA4_COOKIE_EXPIRES_SECONDS}`);
      expect(GA4_COOKIE_EXPIRES_SECONDS).toBe(34128000);
      expect(layer).not.toMatch(
        /adsbygoogle|mediavine|doubleclick|fundingchoices/i,
      );
      syncGa4();
      expect(scripts).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("ads stay off", () => {
  it("excludes kids guides and never allows a path", () => {
    expect(adsEnabled()).toBe(false);
    expect(isAdsExcludedPath("/guide/typing-for-kids")).toBe(true);
    expect(isAdsExcludedPath("/guide/teaching-kids-to-type/")).toBe(true);
    expect(isAdsExcludedPath("/")).toBe(false);
    expect(adsAllowedOnPath("/")).toBe(false);
    expect(adsAllowedOnPath("/guide/typing-for-kids")).toBe(false);
  });

  it("does not add ad tags or a GA4 CSP entry while the measurement id is empty", () => {
    const files = [
      "src/ts/analytics/ga4.ts",
      "src/ts/analytics/static-boot.ts",
      "src/ts/ads/excluded-paths.ts",
      "src/html/static-page/footer.html",
      "src/index.html",
    ];
    for (const file of files) {
      const text = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
      expect(text, file).not.toMatch(/adsbygoogle|mediavine|fundingchoices/i);
    }
    expect(ga4CspSources(undefined)).toBeUndefined();
    expect(ga4CspSources("")).toBeUndefined();
    const csp = ga4CspSources("G-TEST1234");
    expect(csp?.["script-src"]).toEqual(["https://www.googletagmanager.com"]);
    expect(JSON.stringify(csp)).not.toMatch(
      /doubleclick|googleadservices|mediavine/i,
    );
  });
});

describe("legal copy", () => {
  it("uses the interim FAQ answer and the About sentence", () => {
    const flat = (value: string): string => value.replace(/\s+/g, " ");
    const faq = readFileSync(path.join(src, "faq.html"), "utf8");
    const about = flat(
      readFileSync(path.join(src, "guide/about.html"), "utf8"),
    );
    const footer = readFileSync(
      path.join(src, "html/static-page/footer.html"),
      "utf8",
    );
    const privacy = readFileSync(path.join(src, "privacy.html"), "utf8");
    expect(faq).toContain(FAQ_INTERIM);
    expect(faq).not.toContain("No analytics or tracking scripts");
    expect(about).toContain(ABOUT);
    expect(about).not.toMatch(/no analytics/i);
    expect(footer).toContain("Privacy and cookie settings");
    expect(footer).not.toContain("static-boot");
    expect(footer).not.toMatch(
      /gtag\(|google-analytics|googletagmanager|adsbygoogle|mediavine/,
    );
    for (const file of [
      "guide/typing-for-kids.html",
      "guide/teaching-kids-to-type.html",
    ]) {
      const html = readFileSync(path.join(src, file), "utf8");
      expect(html, file).toContain('src="/kids-flow.js"');
      expect(html, file).not.toMatch(
        /static-boot|gtag\(|googletagmanager|google-analytics/i,
      );
    }
    const kidsHtml = injectStaticConsentScript(
      '<head></head><button type="button" data-consent-settings>Privacy and cookie settings</button><script type="module" src="/ts/analytics/static-boot.ts"></script></body>',
      "/src/guide/typing-for-kids.html",
    );
    expect(kidsHtml).not.toContain("static-boot");
    expect(kidsHtml).not.toContain("data-consent-settings");
    expect(kidsHtml).toContain('src="/kids-flow.js"');
    const flagScript = readFileSync(
      path.resolve(__dirname, "../../static/kids-flow.js"),
      "utf8",
    );
    expect(flagScript).toContain(
      'sessionStorage.setItem("puggie-kids-flow", "1")',
    );
    expect(flagScript).not.toMatch(/gtag\(|googletagmanager|google-analytics/i);
    expect(kidsHtml).not.toMatch(/gtag\(|googletagmanager|google-analytics/i);
    const faqHtml = injectStaticConsentScript(
      "<button data-consent-settings></button>\n  </body>",
      "/src/faq.html",
    );
    expect(faqHtml).toContain('src="/ts/analytics/static-boot.ts"');
    expect(privacy).not.toContain("no analytics scripts");
  });
});

const GA_JAR =
  "_ga=GA1.1.111.222; _ga_B8GK1C9T6T=GS1.1.1; __cf_bm=keep; theme=keep";

const ACCEPTED = {
  security: true,
  analytics: true,
  doNotSellOrShare: false,
} as const;

const REJECTED = {
  security: true,
  analytics: false,
  doNotSellOrShare: true,
} as const;

describe("GA cookie withdrawal", () => {
  it("expires _ga and _ga_* on the current host and on .puggietype.com", () => {
    for (const hostname of ["puggietype.com", "www.puggietype.com"]) {
      const writes: string[] = [];
      deleteGaCookies({
        cookieHeader: GA_JAR,
        hostname,
        protocol: "https:",
        write: (value) => {
          writes.push(value);
        },
      });
      expect(writes, hostname).toHaveLength(4);
      for (const name of ["_ga", "_ga_B8GK1C9T6T"]) {
        const lines = writes.filter((line) => line.startsWith(`${name}=`));
        expect(lines, `${hostname} ${name}`).toEqual([
          `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; path=/; SameSite=Lax; Secure`,
          `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; path=/; SameSite=Lax; Secure; domain=.puggietype.com`,
        ]);
      }
      expect(writes.join("\n")).not.toMatch(/__cf_bm|theme/);
    }
  });

  it("does not write cookies when analytics was never accepted", () => {
    const writes: string[] = [];
    vi.spyOn(document, "cookie", "get").mockReturnValue(GA_JAR);
    vi.spyOn(document, "cookie", "set").mockImplementation((value) => {
      writes.push(value);
    });
    try {
      writeConsentRecord(REJECTED);
      expect(readConsentRecord()).toEqual(REJECTED);
      expect(writes).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("deletes GA cookies only when a prior accept is withdrawn", () => {
    const writes: string[] = [];
    vi.spyOn(document, "cookie", "get").mockReturnValue(GA_JAR);
    vi.spyOn(document, "cookie", "set").mockImplementation((value) => {
      writes.push(value);
    });
    try {
      writeConsentRecord(ACCEPTED);
      expect(writes).toEqual([]);
      writeConsentRecord(ACCEPTED);
      expect(writes).toEqual([]);
      writeConsentRecord(REJECTED);
      expect(readConsentRecord()?.analytics).toBe(false);
      expect(writes).toEqual(
        ["_ga", "_ga_B8GK1C9T6T"].flatMap((name) =>
          gaCookieExpiryLines(name, location.hostname, location.protocol),
        ),
      );
      writes.length = 0;
      writeConsentRecord(REJECTED);
      expect(writes).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("does not load GA4 on the next page load after analytics is withdrawn", async () => {
    env.ga4MeasurementId = "G-TEST1234";
    window.history.pushState({}, "", "/");
    sessionStorage.removeItem("puggie-kids-flow");
    writeConsentRecord(ACCEPTED);
    const scripts: HTMLScriptElement[] = [];
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) scripts.push(node);
      return node;
    });
    try {
      vi.resetModules();
      const accepted = await import("../../src/ts/analytics/ga4");
      scripts.length = 0;
      accepted.syncGa4();
      expect(scripts).toHaveLength(1);
      expect(scripts[0]?.getAttribute("src")).toBe(
        `${GA4_SCRIPT_URL}?id=G-TEST1234`,
      );

      writeConsentRecord(REJECTED);
      vi.resetModules();
      const withdrawn = await import("../../src/ts/analytics/ga4");
      withdrawn.syncGa4();
      expect(scripts).toHaveLength(1);
    } finally {
      env.ga4MeasurementId = "";
      vi.restoreAllMocks();
    }
  });
});

describe("in-session GA withdrawal", () => {
  const id = "G-TEST1234";

  function bootAccepted(): void {
    env.ga4MeasurementId = id;
    window.history.pushState({}, "", "/");
    sessionStorage.removeItem("puggie-kids-flow");
    writeConsentRecord(ACCEPTED);
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => node);
    loadGa4(id);
  }

  function flag(): unknown {
    return Reflect.get(window, gaDisableKey(id));
  }

  function finish(): void {
    env.ga4MeasurementId = "";
    Reflect.set(window, gaDisableKey(id), false);
    window.history.pushState({}, "", "/");
    vi.restoreAllMocks();
  }

  it("sets the ga-disable flag before consent deny and before cookie deletion", () => {
    bootAccepted();
    const layer =
      (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
    let consentWhileDisabled = false;
    const push = layer.push.bind(layer);
    vi.spyOn(layer, "push").mockImplementation((entry: unknown) => {
      const text = JSON.stringify(entry);
      if (
        text.includes('"consent"') &&
        text.includes('"analytics_storage":"denied"')
      ) {
        consentWhileDisabled = flag() === true;
        expect(isGaTransportBlocked()).toBe(true);
      }
      return push(entry);
    });
    const cookieOrder: string[] = [];
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "_ga=GA1.1.1.1; _ga_TEST=GS1.1",
    );
    vi.spyOn(document, "cookie", "set").mockImplementation(() => {
      cookieOrder.push(
        consentWhileDisabled && flag() === true ? "after" : "before",
      );
    });
    try {
      expect(flag()).not.toBe(true);
      expect(isGaTransportBlocked()).toBe(false);
      writeConsentRecord(REJECTED);
      expect(flag()).toBe(true);
      expect(consentWhileDisabled).toBe(true);
      expect(cookieOrder.length).toBeGreaterThan(0);
      expect(cookieOrder.every((mark) => mark === "after")).toBe(true);
    } finally {
      finish();
    }
  });

  it("drops page_view and other events on later route changes", () => {
    bootAccepted();
    const page = window as Window & {
      dataLayer?: unknown[];
      gtag?: (...args: unknown[]) => void;
    };
    const layer = page.dataLayer ?? [];
    const router = readFileSync(
      path.join(src, "ts/controllers/route-controller.ts"),
      "utf8",
    );
    try {
      expect(router.match(/onSpaRouteChange\(\)/g)).toHaveLength(1);
      const sent = layer.length;
      window.history.pushState({}, "", "/faq");
      onSpaRouteChange();
      expect(JSON.stringify(layer.slice(sent))).toContain('"page_view"');

      writeConsentRecord(REJECTED);
      const sets: string[] = [];
      vi.spyOn(document, "cookie", "set").mockImplementation(
        (value: string) => {
          sets.push(value);
        },
      );
      const frozen = layer.length;
      for (const next of ["/about", "/privacy", "/settings"]) {
        window.history.pushState({}, "", next);
        onSpaRouteChange();
        page.gtag?.("event", "page_view", { page_path: next });
        page.gtag?.("event", "scroll", { page_path: next });
      }
      expect(layer.length).toBe(frozen);
      expect(JSON.stringify(layer.slice(frozen))).not.toContain('"page_view"');
      expect(sets).toEqual([]);
    } finally {
      finish();
    }
  });

  it("re-accepts in the same tab by clearing the disable flag", () => {
    bootAccepted();
    const layer =
      (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
    try {
      writeConsentRecord(REJECTED);
      expect(flag()).toBe(true);
      window.history.pushState({}, "", "/about");
      onSpaRouteChange();

      writeConsentRecord(ACCEPTED);
      expect(flag()).toBe(false);
      syncGa4();
      const at = layer.length;
      window.history.pushState({}, "", "/settings");
      onSpaRouteChange();
      const added = JSON.stringify(layer.slice(at));
      expect(added).toContain('"page_view"');
      expect(added).toContain("/settings");
      expect(flag()).toBe(false);
    } finally {
      finish();
    }
  });
});

const PAGE_SECRETS = [
  "ada@example.com",
  "sekret",
  "invite-9",
  "discord-token",
  "access_token",
];

function dataLayer(): unknown[] {
  return (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
}

/** gtag.js reads indexed fields of an Arguments object, not a plain Array. */
function isGtagArguments(entry: unknown): entry is IArguments {
  return Object.prototype.toString.call(entry) === "[object Arguments]";
}

function isCommand(entry: unknown, command: string): entry is IArguments {
  return isGtagArguments(entry) && entry[0] === command;
}

function pageViews(layer: unknown[]): IArguments[] {
  return layer.filter((entry): entry is IArguments => {
    return isCommand(entry, "event") && entry[1] === "page_view";
  });
}

function assertCleanPagePayloads(layer: unknown[]): void {
  const tracked = layer.filter(
    (entry) => isCommand(entry, "config") || isCommand(entry, "event"),
  );
  const text = JSON.stringify(tracked);
  for (const secret of PAGE_SECRETS) {
    expect(text).not.toContain(secret);
  }
  for (const entry of tracked) {
    if (!isCommand(entry, "config") && !isCommand(entry, "event")) continue;
    const payload = entry[2];
    if (payload === null || typeof payload !== "object") continue;
    const fields = payload as { page_path?: string; page_location?: string };
    if (typeof fields.page_path === "string") {
      expect(fields.page_path).not.toMatch(/[?#]/);
    }
    if (typeof fields.page_location === "string") {
      expect(fields.page_location).not.toMatch(/[?#]/);
    }
  }
}

describe("sanitized single page view", () => {
  const id = "G-PRIV1234";

  async function freshGa(): Promise<
    typeof import("../../src/ts/analytics/ga4")
  > {
    const page = window as Window & { dataLayer?: unknown[]; gtag?: unknown };
    page.dataLayer = [];
    Reflect.deleteProperty(page, "gtag");
    vi.resetModules();
    return import("../../src/ts/analytics/ga4");
  }

  function show(relative: string): void {
    const url = new URL(relative, location.origin);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  beforeEach(() => {
    env.ga4MeasurementId = id;
    sessionStorage.removeItem("puggie-kids-flow");
    writeConsentRecord(ACCEPTED);
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => node);
  });

  afterEach(() => {
    env.ga4MeasurementId = "";
    window.history.pushState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("first load sends one page_view and drops query and Discord hash", async () => {
    show(
      "/login?email=ada@example.com&token=sekret&code=invite-9&reset=now#access_token=discord-token",
    );
    expect(location.search).toContain("token=sekret");
    expect(location.hash).toContain("access_token=discord-token");
    const ga = await freshGa();
    ga.loadGa4(id);
    const layer = dataLayer();
    assertCleanPagePayloads(layer);
    const views = pageViews(layer);
    expect(views).toHaveLength(1);
    expect(views[0]?.[2]).toMatchObject({
      page_path: "/login",
      page_location: `${location.origin}/login`,
    });
    const config = layer.find((entry) => isCommand(entry, "config"));
    expect(config?.[2]).toMatchObject({
      send_page_view: false,
      page_path: "/login",
      page_location: `${location.origin}/login`,
    });
  });

  it("sends one page_view for the first load, /about, and a repeated path", async () => {
    show("/");
    const ga = await freshGa();
    ga.loadGa4(id);
    const layer = dataLayer();
    expect(pageViews(layer)).toHaveLength(1);

    show("/faq?email=ada@example.com");
    ga.onSpaRouteChange();
    expect(pageViews(layer)).toHaveLength(2);

    show("/about?token=sekret&code=invite-9#access_token=discord-token");
    expect(location.search).toContain("token=sekret");
    expect(location.hash).toContain("access_token");
    ga.onSpaRouteChange();
    ga.onSpaRouteChange();
    const views = pageViews(layer);
    expect(views).toHaveLength(3);
    const about = views.filter((entry) => {
      const payload = entry[2] as { page_path?: string };
      return payload.page_path === "/about";
    });
    expect(about).toHaveLength(1);
    expect(about[0]?.[2]).toMatchObject({
      page_path: "/about",
      page_location: `${location.origin}/about`,
    });
    assertCleanPagePayloads(layer);
  });

  it("pushes Arguments objects for consent, set, config, and event", async () => {
    show("/");
    const ga = await freshGa();
    ga.loadGa4(id);
    writeConsentRecord(REJECTED);
    const layer = dataLayer();
    expect(layer.length).toBeGreaterThan(0);
    for (const entry of layer) {
      expect(Object.prototype.toString.call(entry)).toBe("[object Arguments]");
      expect(Array.isArray(entry)).toBe(false);
    }
    const commands = layer as IArguments[];
    const third = (entry: IArguments): Record<string, unknown> | undefined => {
      const value: unknown = entry[2];
      if (value === null || typeof value !== "object") return undefined;
      return value as Record<string, unknown>;
    };
    expect(
      commands.some(
        (entry) =>
          entry[0] === "consent" &&
          entry[1] === "default" &&
          third(entry)?.["analytics_storage"] === "denied",
      ),
    ).toBe(true);
    expect(
      commands.some(
        (entry) =>
          entry[0] === "consent" &&
          entry[1] === "update" &&
          third(entry)?.["analytics_storage"] === "granted",
      ),
    ).toBe(true);
    expect(
      commands.some(
        (entry) =>
          entry[0] === "consent" &&
          entry[1] === "update" &&
          third(entry)?.["analytics_storage"] === "denied",
      ),
    ).toBe(true);
    expect(
      commands.some(
        (entry) => entry[0] === "set" && entry[1] === "allow_google_signals",
      ),
    ).toBe(true);
    expect(
      commands.some((entry) => entry[0] === "config" && entry[1] === id),
    ).toBe(true);
    expect(
      commands.some(
        (entry) => entry[0] === "event" && entry[1] === "page_view",
      ),
    ).toBe(true);
  });

  it("sends /about again after withdraw and re-accept on that path", async () => {
    show("/about");
    const page = window as Window & { dataLayer?: unknown[]; gtag?: unknown };
    page.dataLayer = [];
    Reflect.deleteProperty(page, "gtag");
    vi.resetModules();
    const ga = await import("../../src/ts/analytics/ga4");
    const consent = await import("../../src/ts/analytics/consent");
    ga.loadGa4(id);
    expect(pageViews(dataLayer())).toHaveLength(1);
    expect(pageViews(dataLayer())[0]?.[2]).toMatchObject({
      page_path: "/about",
    });

    consent.writeConsentRecord(REJECTED);
    expect(Reflect.get(window, ga.gaDisableKey(id))).toBe(true);
    expect(pageViews(dataLayer())).toHaveLength(1);

    consent.writeConsentRecord(ACCEPTED);
    expect(Reflect.get(window, ga.gaDisableKey(id))).toBe(false);
    ga.syncGa4();
    ga.onSpaRouteChange();
    const views = pageViews(dataLayer());
    expect(views).toHaveLength(2);
    expect(views[1]?.[2]).toMatchObject({ page_path: "/about" });
    expect(Reflect.get(window, ga.gaDisableKey(id))).toBe(false);
  });

  it("sends again when /about is visited after another route", async () => {
    show("/about");
    const ga = await freshGa();
    ga.loadGa4(id);
    show("/settings");
    ga.onSpaRouteChange();
    show("/about");
    ga.onSpaRouteChange();
    const views = pageViews(dataLayer());
    expect(views).toHaveLength(3);
    expect(
      views.map((entry) => (entry[2] as { page_path?: string }).page_path),
    ).toEqual(["/about", "/settings", "/about"]);
  });
});
