import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  KIDS_GUIDE_PATH,
  TEACHING_KIDS_GUIDE_PATH,
} from "../../src/ts/controllers/background-music";
import {
  cspWithoutAnalyticsAds,
  ga4CspSources,
  isAnalyticsAdsSource,
} from "../../vite-plugins/ga4-csp";
import {
  connectSrcOrigins,
  KIDS_CSP_PATHS,
  renderHeaders,
} from "../../vite-plugins/pages-headers";

const template = readFileSync(
  path.resolve(__dirname, "../../static/_headers"),
  "utf8",
);
const HASH = "'sha256-abc+/='";
const values = {
  scriptHashes: [HASH],
  wsOrigin: connectSrcOrigins(undefined),
};

const GOOGLE_HOST =
  /google-analytics|googletagmanager|analytics\.google|doubleclick|googleadservices|googlesyndication|googletagservices|fundingchoices|adservice\.google/i;

/** path -> header lines, skipping comments and blanks */
function headerRules(headers: string): Map<string, string[]> {
  const rules = new Map<string, string[]>();
  let current = "";
  for (const line of headers.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = line.trim();
      rules.set(current, []);
      continue;
    }
    const bucket = rules.get(current);
    if (bucket === undefined) throw new Error(`header before a path: ${line}`);
    bucket.push(line.trim());
  }
  return rules;
}

function directive(policy: string, name: string): string {
  return (
    policy
      .split(";")
      .map((part) => part.trim())
      .find((part) => part === name || part.startsWith(`${name} `)) ?? ""
  );
}

function cspLines(lines: string[]): string[] {
  return lines
    .filter((line) => line.startsWith("Content-Security-Policy:"))
    .map((line) => line.slice("Content-Security-Policy:".length).trim());
}

describe("analytics/ads source filter", () => {
  it("matches analytics, tag manager, and ads hosts, including wildcards", () => {
    for (const token of [
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://*.googletagmanager.com",
      "https://region1.google-analytics.com",
      "https://stats.g.doubleclick.net",
      "https://www.googleadservices.com",
      "https://pagead2.googlesyndication.com",
      "https://www.googletagservices.com",
      "https://fundingchoicesmessages.google.com",
      "https://www.adservice.google.com/pagead",
    ]) {
      expect(isAnalyticsAdsSource(token), token).toBe(true);
    }
  });

  it("leaves scheme sources and non-ads Google hosts", () => {
    for (const token of [
      "'self'",
      "'sha256-abc+/='",
      "data:",
      "blob:",
      "https:",
      "https://apis.google.com",
      "https://identitytoolkit.googleapis.com",
      "https://challenges.cloudflare.com",
      "https://fonts.gstatic.com",
      "wss://ws.puggietype.com",
    ]) {
      expect(isAnalyticsAdsSource(token), token).toBe(false);
    }
  });

  it("strips those hosts only from script-src, connect-src, and img-src", () => {
    const policy = [
      "default-src 'self'",
      "script-src 'self' https://www.googletagmanager.com https://apis.google.com",
      "img-src 'self' data: blob: https: https://www.google-analytics.com https://googleads.g.doubleclick.net",
      "connect-src 'self' https://*.google-analytics.com https://poetrydb.org",
      "font-src 'self' data:",
    ].join("; ");
    const out = cspWithoutAnalyticsAds(policy);
    expect(directive(out, "script-src")).toBe(
      "script-src 'self' https://apis.google.com",
    );
    expect(directive(out, "img-src")).toBe("img-src 'self' data: blob: https:");
    expect(directive(out, "connect-src")).toBe(
      "connect-src 'self' https://poetrydb.org",
    );
    expect(directive(out, "font-src")).toBe("font-src 'self' data:");
    expect(directive(out, "default-src")).toBe("default-src 'self'");
    expect(out).not.toMatch(GOOGLE_HOST);
  });
});

describe("kids CSP rules", () => {
  it("covers both kids guides, including the trailing-slash redirects", () => {
    expect(KIDS_CSP_PATHS).toContain(TEACHING_KIDS_GUIDE_PATH);
    expect(KIDS_CSP_PATHS).toContain(KIDS_GUIDE_PATH);
    expect(KIDS_CSP_PATHS).toEqual([
      "/guide/teaching-kids-to-type",
      "/guide/teaching-kids-to-type/",
      "/guide/typing-for-kids",
      "/guide/typing-for-kids/",
    ]);
  });

  function render(id: string | undefined): Map<string, string[]> {
    const extraCsp = ga4CspSources(id);
    return headerRules(
      renderHeaders(template, {
        ...values,
        ...(extraCsp === undefined ? {} : { extraCsp }),
      }),
    );
  }

  function policies(rules: Map<string, string[]>, rulePath: string): string[] {
    const lines = rules.get(rulePath);
    expect(lines, rulePath).toBeDefined();
    return cspLines(lines ?? []);
  }

  it("build with G-QATEST0000: homepage CSP has Google hosts, kids CSP has none", () => {
    const rules = render("G-QATEST0000");
    const home = policies(rules, "/*");
    expect(home).toHaveLength(1);
    const homePolicy = home[0] ?? "";
    expect(homePolicy).toContain("https://www.googletagmanager.com");
    expect(homePolicy).toContain("https://www.google-analytics.com");
    expect(homePolicy).toContain("https://*.google-analytics.com");
    expect(homePolicy).toContain("https://*.analytics.google.com");
    expect(homePolicy).toContain("https://*.googletagmanager.com");
    expect(directive(homePolicy, "script-src")).toContain(HASH);
    expect(directive(homePolicy, "font-src")).toBe("font-src 'self' data:");
    expect(directive(homePolicy, "img-src")).toBe(
      "img-src 'self' data: blob: https:",
    );

    for (const rulePath of KIDS_CSP_PATHS) {
      const lines = rules.get(rulePath) ?? [];
      expect(lines[0], rulePath).toBe("! Content-Security-Policy");
      const set = policies(rules, rulePath);
      expect(set, rulePath).toHaveLength(1);
      const policy = set[0] ?? "";
      expect(policy, rulePath).not.toMatch(GOOGLE_HOST);
      expect(directive(policy, "script-src")).toBe(`script-src 'self' ${HASH}`);
      expect(directive(policy, "connect-src")).toBe(
        "connect-src 'self' wss://ws.puggietype.com https://ws.puggietype.com https://poetrydb.org https://*.wikipedia.org",
      );
      expect(directive(policy, "img-src")).toBe(
        "img-src 'self' data: blob: https:",
      );
      expect(directive(policy, "font-src")).toBe("font-src 'self' data:");
      expect(directive(policy, "style-src")).toBe(
        "style-src 'self' 'unsafe-inline'",
      );
      expect(policy).not.toMatch(/__[A-Z_]+__/);
    }

    expect(policies(rules, "/")).toEqual([]);
    expect(rules.has("/privacy")).toBe(true);
    expect(policies(rules, "/privacy")).toEqual([]);
    for (const line of rules.get("/guide/*") ?? []) {
      expect(line.startsWith("Content-Security-Policy:")).toBe(false);
    }
  });

  it("build with no measurement id: neither CSP lists a Google host", () => {
    expect(ga4CspSources(undefined)).toBeUndefined();
    expect(ga4CspSources("")).toBeUndefined();
    const rules = render(undefined);
    const home = policies(rules, "/*")[0] ?? "";
    expect(home).not.toMatch(GOOGLE_HOST);
    expect(home).toContain(`script-src 'self' ${HASH}`);
    for (const rulePath of KIDS_CSP_PATHS) {
      const lines = rules.get(rulePath) ?? [];
      expect(lines[0], rulePath).toBe("! Content-Security-Policy");
      const set = policies(rules, rulePath);
      expect(set, rulePath).toEqual([home]);
      expect(set[0]).not.toMatch(GOOGLE_HOST);
    }
  });

  it("keeps every header line inside the Pages 2000 character limit", () => {
    const headers = renderHeaders(template, {
      ...values,
      extraCsp: {
        ...ga4CspSources("G-QATEST0000"),
        "img-src": [
          "https://www.google-analytics.com",
          "https://googleads.g.doubleclick.net",
        ],
      },
    });
    for (const line of headers.split("\n")) {
      expect(line.length, line.slice(0, 80)).toBeLessThanOrEqual(2000);
    }
    const kids = policies(headerRules(headers), "/guide/teaching-kids-to-type");
    expect(directive(kids[0] ?? "", "img-src")).toBe(
      "img-src 'self' data: blob: https:",
    );
    expect(kids[0]).not.toMatch(GOOGLE_HOST);
    expect(policies(headerRules(headers), "/*")[0]).toContain(
      "https://googleads.g.doubleclick.net",
    );
  });
});
