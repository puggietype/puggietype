import { describe, expect, it } from "vitest";

import {
  checkAdBundle as check,
  startupChunks as startup,
} from "../../../scripts/check-ad-bundle.mjs";

function dist(contents: Record<string, string>): {
  files: string[];
  read: (rel: string) => string;
} {
  return {
    files: Object.keys(contents),
    read: (rel) => contents[rel] ?? "",
  };
}

const base = {
  "index.html": '<script type="module" src="/js/puggietype.abc.js"></script>',
  "js/puggietype.abc.js":
    'import{a}from"./vendor.def.js";import("./index.x.js")',
  "js/vendor.def.js": "export const a=1",
  "js/index.x.js": 'import("./adsense.123.js")',
  _headers: "Content-Security-Policy: default-src 'self'",
  "languages/english.json": '["sentry"]',
};

describe("check-ad-bundle", () => {
  it("passes a clean ads-off build", () => {
    const d = dist(base);
    expect(check(d.files, d.read, false)).toEqual([]);
  });

  it("finds the chunks loaded at startup through static imports only", () => {
    const d = dist({ ...base, "js/adsense.123.js": "x" });
    expect([...startup(d.files, d.read)].sort()).toEqual([
      "js/puggietype.abc.js",
      "js/vendor.def.js",
    ]);
  });

  it("fails on other ad, analytics or error-reporting networks", () => {
    for (const word of [
      "googletagmanager",
      "google-analytics",
      "Sentry",
      "nitropay",
      "playwire",
    ]) {
      const d = dist({ ...base, "js/vendor.def.js": `load("${word}")` });
      expect(check(d.files, d.read, true)).toEqual([
        `js/vendor.def.js: forbidden third party "${word}"`,
      ]);
    }
  });

  it("ads off: googlesyndication or an AdSense chunk anywhere fails", () => {
    const d = dist({
      ...base,
      "js/adsense.123.js": "pagead2.googlesyndication.com",
    });
    expect(check(d.files, d.read, false)).toEqual([
      "js/adsense.123.js: googlesyndication in an ads-off build",
      "AdSense chunk in an ads-off build: js/adsense.123.js",
    ]);
  });

  it("ads on: googlesyndication only in the AdSense chunk and the CSP", () => {
    const okFiles = {
      ...base,
      "js/adsense.123.js": "pagead2.googlesyndication.com",
      _headers: "script-src https://*.googlesyndication.com",
    };
    const ok = dist(okFiles);
    expect(check(ok.files, ok.read, true)).toEqual([]);
    const bad = dist({
      ...okFiles,
      "js/adsense.123.js": "x",
      "js/vendor.def.js": "googlesyndication",
    });
    expect(check(bad.files, bad.read, true)).toEqual([
      "js/vendor.def.js: googlesyndication outside the AdSense chunk",
    ]);
  });

  it("ads on: the AdSense chunk must not load at startup", () => {
    const d = dist({
      ...base,
      "index.html":
        '<script src="/js/puggietype.abc.js"></script><link rel="modulepreload" href="/js/adsense.123.js">',
      "js/adsense.123.js": "googlesyndication",
    });
    expect(check(d.files, d.read, true)).toEqual([
      "js/adsense.123.js: AdSense chunk is loaded at startup",
    ]);
  });
});
