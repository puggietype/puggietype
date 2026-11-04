import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_ORIGIN,
  KeyValueStore,
  isExternalOpenable,
  isFullscreenShortcut,
  isInternalUrl,
  resolveAppPath,
  windowOptions,
} from "../src/shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve("/srv/dist");

describe("windowOptions", () => {
  it("isolates and sandboxes the renderer", () => {
    const w = windowOptions("/p/preload.cjs").webPreferences;
    assert.equal(w.contextIsolation, true);
    assert.equal(w.nodeIntegration, false);
    assert.equal(w.nodeIntegrationInWorker, false);
    assert.equal(w.sandbox, true);
    assert.equal(w.webSecurity, true);
    assert.equal(w.preload, "/p/preload.cjs");
  });
});

describe("resolveAppPath", () => {
  it("maps app:// paths into dist", () => {
    assert.equal(
      resolveAppPath(dist, `${APP_ORIGIN}/js/a.js`),
      path.join(dist, "js/a.js"),
    );
  });
  it("serves index.html for the root and SPA routes", () => {
    assert.equal(
      resolveAppPath(dist, `${APP_ORIGIN}/`),
      path.join(dist, "index.html"),
    );
    assert.equal(
      resolveAppPath(dist, `${APP_ORIGIN}/settings`),
      path.join(dist, "index.html"),
    );
  });
  it("refuses traversal, other hosts and other schemes", () => {
    for (const p of [
      "/%2e%2e/%2e%2e/etc/passwd.txt",
      "/..%2fsecret.txt",
      "/a/..%2f..%2f..%2fx.js",
      "/%2e%2e%5csecret.txt",
    ]) {
      const r = resolveAppPath(dist, `${APP_ORIGIN}${p}`);
      assert.ok(
        r === undefined || r.startsWith(dist + path.sep),
        `${p} -> ${r}`,
      );
    }
    assert.equal(
      resolveAppPath(dist, `${APP_ORIGIN}/..%2fsecret.txt`),
      undefined,
    );
    assert.equal(resolveAppPath(dist, "app://evil/index.html"), undefined);
    assert.equal(resolveAppPath(dist, "file:///etc/passwd"), undefined);
    assert.equal(resolveAppPath(dist, "not a url"), undefined);
  });
});

describe("navigation policy", () => {
  it("keeps only app://puggietype inside the window", () => {
    assert.equal(isInternalUrl(`${APP_ORIGIN}/settings`), true);
    assert.equal(isInternalUrl("https://puggietype.com/"), false);
    assert.equal(isInternalUrl("app://other/"), false);
  });
  it("opens only https and mailto externally", () => {
    assert.equal(isExternalOpenable("https://puggietype.com/source"), true);
    assert.equal(isExternalOpenable("mailto:hi@example.com"), true);
    assert.equal(isExternalOpenable("file:///etc/passwd"), false);
    assert.equal(isExternalOpenable("javascript:alert(1)"), false);
  });
});

describe("fullscreen shortcut", () => {
  it("F11 and Alt+Enter toggle on keyDown only", () => {
    assert.equal(isFullscreenShortcut({ type: "keyDown", key: "F11" }), true);
    assert.equal(
      isFullscreenShortcut({ type: "keyDown", key: "Enter", alt: true }),
      true,
    );
    assert.equal(isFullscreenShortcut({ type: "keyUp", key: "F11" }), false);
    assert.equal(
      isFullscreenShortcut({ type: "keyDown", key: "Enter" }),
      false,
    );
    assert.equal(
      isFullscreenShortcut({
        type: "keyDown",
        key: "Enter",
        alt: true,
        control: true,
      }),
      false,
    );
  });
});

describe("KeyValueStore", () => {
  it("round-trips strings and persists on write", () => {
    let disk = "";
    const s = new KeyValueStore(
      () => {
        throw new Error("missing");
      },
      (d) => {
        disk = d;
      },
    );
    assert.equal(s.getItem("a"), null);
    s.setItem("a", "1");
    assert.equal(s.getItem("a"), "1");
    assert.deepEqual(JSON.parse(disk), { a: "1" });
    s.removeItem("a");
    assert.equal(s.getItem("a"), null);
    assert.deepEqual(JSON.parse(disk), {});
  });
  it("ignores corrupt files, non-strings and prototype keys", () => {
    const s = new KeyValueStore(
      () => "{bad",
      () => undefined,
    );
    s.setItem("n", 5);
    assert.equal(s.getItem("n"), null);
    assert.equal(s.getItem("__proto__"), null);
    const t = new KeyValueStore(
      () => JSON.stringify({ ok: "y", num: 3 }),
      () => undefined,
    );
    assert.equal(t.getItem("ok"), "y");
    assert.equal(t.getItem("num"), null);
  });
});

describe("no Steamworks, no ads", () => {
  it("the shell sources reference no Steamworks SDK or ad network", () => {
    const dir = path.resolve(here, "../src");
    const pkg = fs.readFileSync(path.resolve(here, "../package.json"), "utf8");
    for (const f of [...fs.readdirSync(dir).map((n) => path.join(dir, n))]) {
      const text = fs.readFileSync(f, "utf8").toLowerCase();
      for (const bad of [
        "steamworks.js",
        "greenworks",
        "steam_api",
        "adsense",
        "googlesyndication",
      ]) {
        assert.equal(text.includes(bad), false, `${f} mentions ${bad}`);
      }
    }
    const deps = Object.keys({
      ...JSON.parse(pkg).dependencies,
      ...JSON.parse(pkg).devDependencies,
    });
    assert.deepEqual(deps, ["electron"]);
  });
});
