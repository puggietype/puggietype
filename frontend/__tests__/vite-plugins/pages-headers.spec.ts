import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AD_ORIGINS,
  inlineScriptHashes,
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

describe("renderHeaders", () => {
  const template = readFileSync(
    path.resolve(__dirname, "../../static/_headers"),
    "utf8",
  );
  const out = renderHeaders(template, {
    scriptHashes: [sha("a()")],
    wsOrigin: "wss://ws.puggietype.com",
  });

  it("fills every placeholder", () => {
    expect(out).not.toMatch(/__[A-Z_]+__/);
    expect(out).toContain(`script-src 'self' ${sha("a()")};`);
    expect(out).toMatch(/connect-src 'self' wss:\/\/ws\.puggietype\.com /);
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
});

describe("renderHeaders for ads", () => {
  const template = readFileSync(
    path.resolve(__dirname, "../../static/_headers"),
    "utf8",
  );
  const values = {
    scriptHashes: [sha("a()")],
    wsOrigin: "wss://ws.puggietype.com",
  };
  const off = renderHeaders(template, values);
  const on = renderHeaders(template, { ...values, adsEnabled: true });
  const csp = (headers: string): Map<string, string[]> =>
    new Map(
      (/Content-Security-Policy: (.*)/.exec(headers)?.[1] ?? "")
        .split(";")
        .map((d) => d.trim().split(/\s+/))
        .map(([name = "", ...sources]) => [name, sources]),
    );

  it("leaves the default CSP without any Google origin", () => {
    expect(renderHeaders(template, { ...values, adsEnabled: false })).toBe(off);
    expect(off).not.toMatch(/google|doubleclick|gstatic|adtrafficquality/);
    expect(csp(off).get("frame-src")).toEqual(["'none'"]);
  });

  it("adds exactly the Google ad and consent origins in ads builds", () => {
    const policy = csp(on);
    for (const directive of ["script-src", "connect-src", "frame-src"]) {
      expect(policy.get(directive)).toEqual(expect.arrayContaining(AD_ORIGINS));
    }
    expect(policy.get("frame-src")).toEqual(AD_ORIGINS);
    expect(policy.get("script-src")?.slice(0, 2)).toEqual([
      "'self'",
      sha("a()"),
    ]);
    expect(AD_ORIGINS).toEqual([
      "https://*.googlesyndication.com",
      "https://*.doubleclick.net",
      "https://fundingchoicesmessages.google.com",
      "https://*.google.com",
      "https://*.gstatic.com",
      "https://*.adtrafficquality.google",
    ]);
  });

  it("changes nothing else", () => {
    const policyOff = csp(off);
    for (const [name, sources] of csp(on)) {
      if (["script-src", "connect-src", "frame-src"].includes(name)) continue;
      expect(sources).toEqual(policyOff.get(name));
    }
    const otherLines = (h: string): string[] =>
      h.split("\n").filter((l) => !l.includes("Content-Security-Policy"));
    expect(otherLines(on)).toEqual(otherLines(off));
  });
});

describe("static ad files", () => {
  const read = (name: string): string =>
    readFileSync(path.resolve(__dirname, "../../static", name), "utf8");

  it("ads.txt is exactly the one AdSense line", () => {
    expect(read("ads.txt")).toBe(
      "google.com, pub-8233445679738428, DIRECT, f08c47fec0942fa0\n",
    );
  });
  it("ads.txt is served as text/plain", () => {
    expect(read("_headers")).toMatch(
      /\/ads\.txt\n {2}Content-Type: text\/plain; charset=utf-8/,
    );
  });
  it("the committed server switch is off", () => {
    expect(JSON.parse(read("config.json"))).toEqual({ ads: false });
  });
});
