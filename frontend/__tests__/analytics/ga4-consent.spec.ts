import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  ga4MeasurementId: "",
}));

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
      expect(router).toContain("onSpaRouteChange()");
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
