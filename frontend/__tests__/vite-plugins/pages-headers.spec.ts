import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
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
