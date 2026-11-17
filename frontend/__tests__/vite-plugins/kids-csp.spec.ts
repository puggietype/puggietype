import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

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
  inlineScriptHashes,
  KIDS_CSP_PATHS,
  KIDS_HTML_FILES,
  KIDS_IMG_SRC,
  pagesHeaders,
  renderHeaders,
  withDirective,
  withKidsMetaCsp,
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
  /google-analytics|googletagmanager|analytics\.google|doubleclick|googleadservices|googlesyndication|googletagservices|fundingchoices|adservice\.google|google\.com|gstatic\.com/i;

/**
 * `/*` CSP rendered by origin/main bfbb017 (before the google.com and img-src
 * changes) with HASH and the default WS origin. Non-kids routes must not move.
 */
function mainCspFixture(name: "ga" | "no-ga"): string {
  return readFileSync(
    path.resolve(__dirname, `__fixtures__/main-csp-${name}.txt`),
    "utf8",
  ).trim();
}

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
      "https://google.com",
      "https://www.google.com",
      "https://apis.google.com",
      "https://*.google.com",
      "https://WWW.GOOGLE.COM/recaptcha/",
      "https://www.gstatic.com",
      "https://fonts.gstatic.com",
    ]) {
      expect(isAnalyticsAdsSource(token), token).toBe(true);
    }
  });

  it("leaves scheme sources and hosts that only look like google.com", () => {
    for (const token of [
      "'self'",
      "'sha256-abc+/='",
      "data:",
      "blob:",
      "https:",
      "https://identitytoolkit.googleapis.com",
      "https://notgoogle.com",
      "https://google.com.example",
      "https://challenges.cloudflare.com",
      "wss://ws.puggietype.com",
    ]) {
      expect(isAnalyticsAdsSource(token), token).toBe(false);
    }
  });

  it("strips those hosts only from script-src, connect-src, and img-src", () => {
    const policy = [
      "default-src 'self'",
      "script-src 'self' https://www.googletagmanager.com https://apis.google.com https://challenges.cloudflare.com",
      "img-src 'self' data: blob: https: https://www.google-analytics.com https://googleads.g.doubleclick.net",
      "connect-src 'self' https://*.google-analytics.com https://poetrydb.org",
      "font-src 'self' data:",
    ].join("; ");
    const out = cspWithoutAnalyticsAds(policy);
    expect(directive(out, "script-src")).toBe(
      "script-src 'self' https://challenges.cloudflare.com",
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
      expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
      expect(directive(policy, "img-src")).toBe("img-src 'self'");
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
      expect(set, rulePath).toEqual([
        withDirective(withDirective(home, KIDS_IMG_SRC), "connect-src 'self'"),
      ]);
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
    expect(directive(kids[0] ?? "", "img-src")).toBe("img-src 'self'");
    expect(kids[0]).not.toMatch(GOOGLE_HOST);
    expect(policies(headerRules(headers), "/*")[0]).toContain(
      "https://googleads.g.doubleclick.net",
    );
  });

  it.each([
    ["ga", "G-QATEST0000"],
    ["no-ga", undefined],
  ] as const)(
    "%s build: non-kids CSP is byte-identical to origin/main",
    (name, id) => {
      const rules = render(id);
      expect(policies(rules, "/*")).toEqual([mainCspFixture(name)]);
      for (const [rulePath, lines] of rules) {
        if (rulePath === "/*") continue;
        if ((KIDS_CSP_PATHS as readonly string[]).includes(rulePath)) continue;
        expect(cspLines(lines), rulePath).toEqual([]);
      }
    },
  );

  it("img-src is narrowed on kids routes only", () => {
    const rules = render("G-QATEST0000");
    expect(directive(policies(rules, "/*")[0] ?? "", "img-src")).toBe(
      "img-src 'self' data: blob: https:",
    );
    for (const rulePath of KIDS_CSP_PATHS) {
      const policy = policies(rules, rulePath)[0] ?? "";
      expect(directive(policy, "img-src"), rulePath).toBe("img-src 'self'");
      expect(policy.match(/img-src/g), rulePath).toHaveLength(1);
    }
  });

  it("google.com hosts on the catch-all CSP stay there, off the kids CSP", () => {
    const headers = renderHeaders(template, {
      ...values,
      extraCsp: {
        "script-src": ["https://www.google.com", "https://apis.google.com"],
        "connect-src": ["https://*.google.com", "https://www.gstatic.com"],
      },
    });
    const rules = headerRules(headers);
    const home = policies(rules, "/*")[0] ?? "";
    expect(home).toContain("https://www.google.com https://apis.google.com");
    expect(home).toContain("https://*.google.com https://www.gstatic.com");
    for (const rulePath of KIDS_CSP_PATHS) {
      expect(policies(rules, rulePath)[0], rulePath).not.toMatch(GOOGLE_HOST);
    }
  });
});

describe("withDirective", () => {
  it("replaces an existing directive in place", () => {
    expect(
      withDirective("default-src 'self'; img-src *; x y", "img-src 'self'"),
    ).toBe("default-src 'self'; img-src 'self'; x y");
  });

  it("does not match a directive that only shares a prefix", () => {
    expect(withDirective("img-src-x a; b c", "img-src 'self'")).toBe(
      "img-src-x a; b c; img-src 'self'",
    );
  });
});

const META_CSP_RE =
  /<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"[^>]*>/gi;

function htmlFiles(dir: string, prefix = ""): string[] {
  return readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap(
    (entry) => {
      const rel = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) return htmlFiles(dir, rel);
      return entry.name.endsWith(".html") ? [rel] : [];
    },
  );
}

/** what is wrong with the meta CSPs of a built outDir (empty when fine) */
function metaCspProblems(outDir: string): string[] {
  const problems: string[] = [];
  const rules = headerRules(
    readFileSync(path.join(outDir, "_headers"), "utf8"),
  );
  const header =
    cspLines(rules.get("/guide/teaching-kids-to-type") ?? [])[0] ?? "";
  const files = htmlFiles(outDir);
  for (const file of KIDS_HTML_FILES) {
    if (!files.includes(file)) problems.push(`${file}: missing`);
  }
  for (const file of files) {
    const html = readFileSync(path.join(outDir, file), "utf8");
    const metas = [...html.matchAll(META_CSP_RE)];
    if (!KIDS_HTML_FILES.includes(file)) {
      if (metas.length !== 0) problems.push(`${file}: non-kids meta CSP`);
      if (/http-equiv\s*=\s*["']?content-security-policy/i.test(html)) {
        problems.push(`${file}: non-kids http-equiv CSP`);
      }
      continue;
    }
    if (metas.length !== 1) {
      problems.push(`${file}: ${metas.length} meta CSPs`);
      continue;
    }
    const [tag = "", policy = ""] = metas[0] ?? [];
    if (GOOGLE_HOST.test(policy)) problems.push(`${file}: Google host`);
    if (directive(policy, "img-src") !== "img-src 'self'") {
      problems.push(`${file}: img-src`);
    }
    if (directive(policy, "connect-src") !== "connect-src 'self'") {
      problems.push(`${file}: connect-src`);
    }
    if (policy.includes("frame-ancestors")) {
      problems.push(`${file}: frame-ancestors in meta`);
    }
    const headerMinusFrameAncestors = header.replace(
      /; frame-ancestors [^;]*$/,
      "",
    );
    if (header === "" || policy !== headerMinusFrameAncestors) {
      problems.push(`${file}: meta differs from the kids header`);
    }
    const metaAt = html.indexOf(tag);
    const scriptAt = html.search(/<script\b/i);
    if (scriptAt !== -1 && scriptAt < metaAt) {
      problems.push(`${file}: a script comes before the meta`);
    }
    const scriptSrc = directive(policy, "script-src");
    for (const hash of inlineScriptHashes([html])) {
      if (!scriptSrc.includes(hash)) problems.push(`${file}: no ${hash}`);
    }
  }
  return problems;
}

describe("kids meta CSP in the build output", () => {
  const src = path.resolve(__dirname, "../../src");
  const scratch = mkdtempSync(path.join(tmpdir(), "kids-meta-csp-"));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  /** runs the pagesHeaders closeBundle on a copy of static/_headers and the html sources */
  function build(name: string, id: string | undefined): string {
    const outDir = path.join(scratch, name);
    mkdirSync(path.join(outDir, "guide"), { recursive: true });
    writeFileSync(path.join(outDir, "_headers"), template);
    for (const file of readdirSync(src).filter((f) => f.endsWith(".html"))) {
      cpSync(path.join(src, file), path.join(outDir, file));
    }
    cpSync(path.join(src, "guide"), path.join(outDir, "guide"), {
      recursive: true,
    });
    const extraCsp = ga4CspSources(id);
    const plugin = pagesHeaders({
      wsUrl: undefined,
      ...(extraCsp === undefined ? {} : { extraCsp }),
    });
    const hooks = plugin as unknown as {
      configResolved: (config: unknown) => void;
      closeBundle: () => void;
    };
    hooks.configResolved({ root: outDir, build: { outDir: "." } });
    hooks.closeBundle();
    return outDir;
  }

  it("lists both kids html files", () => {
    expect(KIDS_HTML_FILES).toEqual([
      "guide/teaching-kids-to-type.html",
      "guide/typing-for-kids.html",
    ]);
  });

  it.each([
    ["ga", "G-QATEST0000"],
    ["no-ga", undefined],
  ] as const)(
    "%s build: one meta CSP per kids page, none elsewhere",
    (name, id) => {
      const outDir = build(name, id);
      expect(metaCspProblems(outDir)).toEqual([]);
      const rules = headerRules(
        readFileSync(path.join(outDir, "_headers"), "utf8"),
      );
      const main = cspLines(rules.get("/*") ?? []).map((policy) =>
        policy.replace(/'sha256-[^']*'( 'sha256-[^']*')*/, HASH),
      );
      expect(main).toEqual([mainCspFixture(name)]);
      for (const file of KIDS_HTML_FILES) {
        const html = readFileSync(path.join(outDir, file), "utf8");
        expect(html, file).toMatch(
          /^<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="UTF-8" \/><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' /,
        );
      }
    },
  );

  it.each([
    ["no meta", "0 meta CSPs", (html: string) => html.replace(META_CSP_RE, "")],
    [
      "two metas",
      "2 meta CSPs",
      (html: string) => html.replace(META_CSP_RE, "$&$&"),
    ],
    [
      "a Google host",
      "Google host",
      (html: string) =>
        html.replace(
          "script-src 'self'",
          "script-src 'self' https://www.googletagmanager.com",
        ),
    ],
    [
      "a wide img-src",
      "img-src",
      (html: string) => html.replace("img-src 'self'", "img-src 'self' https:"),
    ],
    [
      "a script before the meta",
      "a script comes before the meta",
      (html: string) =>
        html.replace("<head>", '<head><script src="/x.js"></script>'),
    ],
    [
      "an unhashed inline script",
      "no 'sha256-",
      (html: string) =>
        html.replace("</head>", "<script>console.log(1)</script></head>"),
    ],
  ])("fails a scratch copy with %s", (name, problem, mutate) => {
    const outDir = build(`mutant-${name.replaceAll(" ", "-")}`, "G-QATEST0000");
    expect(metaCspProblems(outDir)).toEqual([]);
    for (const file of KIDS_HTML_FILES) {
      const htmlPath = path.join(outDir, file);
      const html = readFileSync(htmlPath, "utf8");
      const mutated = mutate(html);
      expect(mutated, file).not.toBe(html);
      writeFileSync(htmlPath, mutated);
      const problems = metaCspProblems(outDir);
      expect(
        problems.some((p) => p.startsWith(`${file}: ${problem}`)),
        problems.join("\n"),
      ).toBe(true);
      writeFileSync(htmlPath, html);
    }
  });

  it("fails a scratch copy with a meta CSP on a non-kids page", () => {
    const outDir = build("mutant-non-kids", undefined);
    const kids = readFileSync(
      path.join(outDir, "guide/teaching-kids-to-type.html"),
      "utf8",
    );
    const meta = [...kids.matchAll(META_CSP_RE)][0]?.[0] ?? "";
    const tips = path.join(outDir, "guide/typing-tips.html");
    writeFileSync(
      tips,
      readFileSync(tips, "utf8").replace("<head>", `<head>${meta}`),
    );
    expect(metaCspProblems(outDir)).toEqual([
      "guide/typing-tips.html: non-kids meta CSP",
      "guide/typing-tips.html: non-kids http-equiv CSP",
    ]);
  });

  it("refuses html that already has a CSP meta or has no charset", () => {
    const policy = "default-src 'self'; frame-ancestors 'none'";
    const html = '<head><meta charset="utf-8"><title>x</title></head>';
    const once = withKidsMetaCsp(html, policy);
    expect(once).toBe(
      '<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><title>x</title></head>',
    );
    expect(() => withKidsMetaCsp(once, policy)).toThrow(/already/);
    expect(() => withKidsMetaCsp("<head></head>", policy)).toThrow(/charset/);
  });
});
