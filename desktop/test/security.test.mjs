import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALLOWED_PERMISSIONS,
  buildCsp,
  cspInputsFromHeaders,
  DEFAULT_WS_ORIGIN,
  isPermissionAllowed,
} from "../src/shell.mjs";

const HEADERS = `/*
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-abc+/=' 'unsafe-eval'; connect-src 'self' wss://ws.puggietype.com https://ws.puggietype.com https://poetrydb.org; img-src 'self' https:
`;

const directive = (csp, name) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1);

describe("CSP inputs from the steam build's _headers", () => {
  it("takes only hashes from script-src and ws origins from connect-src", () => {
    assert.deepEqual(cspInputsFromHeaders(HEADERS), {
      scriptHashes: ["'sha256-abc+/='"],
      wsOrigins: ["wss://ws.puggietype.com"],
    });
  });
  it("handles a missing or empty file", () => {
    assert.deepEqual(cspInputsFromHeaders(""), {
      scriptHashes: [],
      wsOrigins: [],
    });
    assert.deepEqual(cspInputsFromHeaders(undefined), {
      scriptHashes: [],
      wsOrigins: [],
    });
  });
});

describe("buildCsp", () => {
  const csp = buildCsp(cspInputsFromHeaders(HEADERS));
  it("allows app:// assets and the inline-script hashes only", () => {
    assert.deepEqual(directive(csp, "default-src"), ["'self'"]);
    assert.deepEqual(directive(csp, "script-src"), [
      "'self'",
      "'sha256-abc+/='",
    ]);
    assert.equal(csp.includes("unsafe-eval"), false);
  });
  it("connects only to self, the ws server and the leaderboard https base", () => {
    assert.deepEqual(directive(csp, "connect-src"), [
      "'self'",
      "wss://ws.puggietype.com",
      "https://ws.puggietype.com",
    ]);
    assert.equal(csp.includes("poetrydb"), false);
  });
  it("blocks frames, plugins, remote images and base/form hijacks", () => {
    assert.deepEqual(directive(csp, "frame-src"), ["'none'"]);
    assert.deepEqual(directive(csp, "object-src"), ["'none'"]);
    assert.deepEqual(directive(csp, "frame-ancestors"), ["'none'"]);
    assert.deepEqual(directive(csp, "base-uri"), ["'self'"]);
    assert.deepEqual(directive(csp, "form-action"), ["'self'"]);
    assert.equal(directive(csp, "img-src").includes("https:"), false);
  });
  it("defaults to the production ws server", () => {
    assert.deepEqual(directive(buildCsp(), "connect-src"), [
      "'self'",
      DEFAULT_WS_ORIGIN,
      "https://ws.puggietype.com",
    ]);
  });
});

describe("permissions", () => {
  it("deny by default, everywhere", () => {
    for (const p of [
      "media",
      "geolocation",
      "notifications",
      "midi",
      "openExternal",
      "clipboard-read",
      "hid",
      "serial",
      "usb",
    ]) {
      assert.equal(isPermissionAllowed(p, "app://puggietype/"), false, p);
    }
  });
  it("allow only the listed ones, only for app://puggietype", () => {
    assert.deepEqual([...ALLOWED_PERMISSIONS].sort(), [
      "clipboard-sanitized-write",
      "fullscreen",
    ]);
    assert.equal(isPermissionAllowed("fullscreen", "app://puggietype/"), true);
    assert.equal(
      isPermissionAllowed(
        "clipboard-sanitized-write",
        "app://puggietype/settings",
      ),
      true,
    );
    assert.equal(
      isPermissionAllowed("fullscreen", "https://evil.example/"),
      false,
    );
    assert.equal(isPermissionAllowed("fullscreen", "app://evil/"), false);
    assert.equal(isPermissionAllowed("fullscreen", undefined), false);
  });
});
