import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  accountsCspSources,
  accountsKidsBlockedSources,
} from "../../vite-plugins/accounts-env";
import { ga4CspSources, mergeCspSources } from "../../vite-plugins/ga4-csp";
import {
  connectSrcOrigins,
  inlineScriptHashes,
  isKidsBlockedSource,
  KIDS_CSP_PATHS,
  kidsCspPolicy,
  renderHeaders,
  wsOrigin,
} from "../../vite-plugins/pages-headers";

const sha = (s: string): string =>
  `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

describe("inlineScriptHashes", () => {
  it("hashes inline scripts only, deduplicated", () => {
    const html = `<script>a()</script><script type="module" src="/x.js"></script>
      <script type="text/javascript">b()</script><script>a()</script>`;
    expect(inlineScriptHashes([html])).toEqual([sha("a()"), sha("b()")]);
  });
  it("skips json data blocks", () => {
    expect(
      inlineScriptHashes(['<script type="application/ld+json">{}</script>']),
    ).toEqual([]);
  });
});

describe("wsOrigin", () => {
  it("defaults to the production server", () => {
    expect(wsOrigin(undefined)).toBe("wss://ws.puggietype.com");
    expect(wsOrigin("")).toBe("wss://ws.puggietype.com");
  });
  it("takes the origin of VITE_WS_URL", () => {
    expect(wsOrigin("wss://staging.example.com:8443/ws")).toBe(
      "wss://staging.example.com:8443",
    );
  });
});

describe("connectSrcOrigins", () => {
  it("allows the http origin next to the websocket origin", () => {
    expect(connectSrcOrigins(undefined)).toBe(
      "wss://ws.puggietype.com https://ws.puggietype.com",
    );
    expect(connectSrcOrigins("ws://localhost:2567/ws")).toBe(
      "ws://localhost:2567 http://localhost:2567",
    );
  });
});

describe("renderHeaders", () => {
  const template = readFileSync(
    path.resolve(__dirname, "../../static/_headers"),
    "utf8",
  );
  const out = renderHeaders(template, {
    scriptHashes: [sha("a()")],
    wsOrigin: connectSrcOrigins(undefined),
  });

  it("fills every placeholder", () => {
    expect(out).not.toMatch(/__[A-Z_]+__/);
    expect(out).toContain(`script-src 'self' ${sha("a()")};`);
    expect(out).toMatch(
      /connect-src 'self' wss:\/\/ws\.puggietype\.com https:\/\/ws\.puggietype\.com /,
    );
  });
  it("sets the security headers", () => {
    for (const header of [
      "X-Content-Type-Options: nosniff",
      "Referrer-Policy: strict-origin-when-cross-origin",
      "Permissions-Policy:",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ]) {
      expect(out).toContain(header);
    }
    expect(out).not.toContain("'unsafe-eval'");
  });
  it("caches hashed assets for a year", () => {
    expect(out).toMatch(
      /\/js\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/,
    );
  });
  it("caches fonts and images long, revalidates html", () => {
    expect(out).toMatch(
      /\/webfonts\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/,
    );
    expect(out).toMatch(
      /\/images\/\*\n {2}Cache-Control: public, max-age=\d{7,}/,
    );
    expect(out).toMatch(
      /\/guide\/\*\n {2}Cache-Control: public, max-age=0, must-revalidate/,
    );
  });
  it("caches background music for a month, with one rule", () => {
    expect(out).toMatch(
      /^\/music\/\*\n {2}Cache-Control: public, max-age=2592000\n/m,
    );
    expect(out.match(/^\/music\//gm)).toHaveLength(1);
    // cloudflare joins values of overlapping rules: never cache-control on /*
    expect(out).not.toMatch(/^\/\*\n(?: {2}.*\n)* {2}Cache-Control/m);
  });
});

describe("kids CSP with accounts on (Legal H4)", () => {
  const template = readFileSync(
    path.resolve(__dirname, "../../static/_headers"),
    "utf8",
  );
  const env = {
    VITE_FEATURE_ACCOUNTS: "true",
    VITE_ACCOUNTS_API_URL: "https://api.example.test",
    VITE_FIREBASE_AUTH_DOMAIN: "dummy-project.firebaseapp.com",
  };
  const extraCsp = mergeCspSources([
    accountsCspSources(env),
    ga4CspSources("G-QATEST0000"),
  ]);
  const out = renderHeaders(template, {
    scriptHashes: [sha("a()")],
    wsOrigin: connectSrcOrigins(undefined),
    ...(extraCsp === undefined ? {} : { extraCsp }),
    kidsBlocked: accountsKidsBlockedSources(env),
  });
  const FORBIDDEN =
    /firebaseapp|googleapis|cloudflare|api\.puggietype|api\.example\.test|google|gstatic|doubleclick/i;

  /** rule path -> its header lines */
  function rules(headers: string): Map<string, string[]> {
    const map = new Map<string, string[]>();
    let current: string[] | undefined;
    for (const line of headers.split("\n")) {
      if (line.startsWith("#") || line.trim() === "") continue;
      if (!line.startsWith(" ")) {
        current = map.get(line.trim()) ?? [];
        map.set(line.trim(), current);
      } else {
        current?.push(line.trim());
      }
    }
    return map;
  }

  it("the catch-all CSP has the accounts hosts (the build is really on)", () => {
    const home = rules(out).get("/*")?.join("\n") ?? "";
    expect(home).toContain("https://challenges.cloudflare.com");
    expect(home).toContain("https://dummy-project.firebaseapp.com");
    expect(home).toContain("https://api.example.test");
  });

  it.each(KIDS_CSP_PATHS)(
    "%s: no accounts, Firebase, Cloudflare or Google host; no frames",
    (kidsPath) => {
      const lines = rules(out).get(kidsPath) ?? [];
      expect(lines[0]).toBe("! Content-Security-Policy");
      const csps = lines.filter((l) =>
        l.startsWith("Content-Security-Policy:"),
      );
      expect(csps).toHaveLength(1);
      const policy = csps[0] ?? "";
      expect(policy).not.toMatch(FORBIDDEN);
      expect(policy).toContain("frame-src 'none'");
      expect(policy).toMatch(/script-src 'self' 'sha256-[^;]+;/);
      expect(policy).toContain("connect-src 'self';");
    },
  );

  it("strips accounts hosts from every directive, by pattern or by the build's own list", () => {
    const policy =
      "default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://x.web.app; connect-src 'self' https://api.puggietype.com https://api.other.test; frame-src https://a.firebaseapp.com; form-action 'self' https://identitytoolkit.googleapis.com; child-src https://*.cloudflare.com";
    const kids = kidsCspPolicy(policy, ["https://api.other.test"]);
    expect(kids).toBe(
      "default-src 'self'; script-src 'self'; connect-src 'self'; frame-src 'none'; form-action 'self'; child-src 'none'; img-src 'self'",
    );
  });

  it("isKidsBlockedSource matches hosts, not look-alikes or keywords", () => {
    for (const token of [
      "https://challenges.cloudflare.com",
      "https://dummy-project.firebaseapp.com",
      "https://securetoken.googleapis.com",
      "https://*.googleapis.com",
      "https://api.puggietype.com",
      "https://api.puggietype.com:443",
    ]) {
      expect(isKidsBlockedSource(token), token).toBe(true);
    }
    for (const token of [
      "'self'",
      "https:",
      "data:",
      "wss://ws.puggietype.com",
      "https://notcloudflare.com.example",
      "https://poetrydb.org",
    ]) {
      expect(isKidsBlockedSource(token), token).toBe(false);
    }
    expect(
      isKidsBlockedSource("https://api.example.test", [
        "https://api.example.test",
      ]),
    ).toBe(true);
  });

  it("accounts off: the kids policy is unchanged by the new rules", () => {
    const off = renderHeaders(template, {
      scriptHashes: [sha("a()")],
      wsOrigin: connectSrcOrigins(undefined),
    });
    const kids = rules(off).get("/guide/teaching-kids-to-type") ?? [];
    expect(kids[1]).toBe(
      `Content-Security-Policy: default-src 'self'; script-src 'self' ${sha("a()")}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self'; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
    );
  });
});
