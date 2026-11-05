import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  adsAllowedOnPath,
  adsEnabled,
  isAdsExcludedPath,
} from "../../src/ts/ads/excluded-paths";
import { GA4_SCRIPT_URL, loadGa4, syncGa4 } from "../../src/ts/analytics/ga4";
import {
  analyticsLoadAllowed,
  consentBannerAllowed,
  COUNTRY_COOKIE,
  kidsAnalyticsExcluded,
  KIDS_FLOW_STORAGE_KEY,
  noteKidsFlowVisit,
  readConsentRecord,
  readKidsFlow,
  readCountryCookie,
  writeConsentRecord,
} from "../../src/ts/analytics/consent";
import { ga4CspSources } from "../../vite-plugins/ga4-csp";
import { injectStaticConsentScript } from "../../vite-plugins/static-consent-script";
import { COUNTRY_COOKIE as edgeCountryCookie } from "../../../functions/_middleware";

const src = path.resolve(__dirname, "../../src");

const FAQ_INTERIM =
  'PuggieType may load Google Analytics 4 so we can understand site traffic. We also see aggregate traffic totals from our host, Cloudflare. Solo test data stays in your browser, except a leaderboard score you choose to submit and the average speed plus a random Quick Match ID sent when you join Quick Match. The <a href="/privacy">privacy policy</a> explains what is collected and for how long.';

const ABOUT =
  "We use privacy-preserving aggregate traffic tools from our host (Cloudflare) and, when enabled, Google Analytics 4. Details are in our";

describe("analytics consent gate", () => {
  it("matches the edge country cookie name", () => {
    expect(COUNTRY_COOKIE).toBe(edgeCountryCookie);
    expect(readCountryCookie("pt_country=us; other=1")).toBe("US");
    expect(readCountryCookie("pt_country=UK")).toBe("GB");
    expect(readCountryCookie("pt_country=XX")).toBeNull();
    expect(readCountryCookie("")).toBeNull();
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
      expect(html, file).toContain('sessionStorage.setItem("puggie-kids-flow"');
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
    expect(kidsHtml).toContain("puggie-kids-flow");
    expect(kidsHtml).not.toMatch(/gtag\(|googletagmanager|google-analytics/i);
    const faqHtml = injectStaticConsentScript(
      "<button data-consent-settings></button>\n  </body>",
      "/src/faq.html",
    );
    expect(faqHtml).toContain('src="/ts/analytics/static-boot.ts"');
    expect(privacy).not.toContain("no analytics scripts");
  });
});
