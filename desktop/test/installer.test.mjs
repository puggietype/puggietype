// Dev installers (electron-builder): config shape, npm scripts, and the
// unpacked-build check against the depot rules. Never runs electron-builder.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  asarFileList,
  checkInstaller,
  findResources,
  installerViolations,
} from "../scripts/check-installer.mjs";
import { scanDepotTree } from "../scripts/depot-allowlist.mjs";
import { stagePackage } from "../scripts/package.mjs";
import { LEGAL_FILES } from "../src/shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const require = createRequire(import.meta.url);
const config = require("../electron-builder.config.cjs");
const pkg = JSON.parse(
  fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"),
);
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const targets = (os) =>
  config[os].target.map((t) => [t.target, [...t.arch].sort().join("+")]);

describe("electron-builder config", () => {
  it("packages the staged app with the GPL bundle next to it", () => {
    assert.equal(config.appId, "com.puggietype.desktop");
    assert.equal(config.productName, "PuggieType");
    assert.deepEqual(config.directories, {
      app: "out/app",
      output: "dist-installers",
    });
    // only what scripts/package.mjs stages into out/app
    assert.deepEqual(config.files, ["package.json", "src/**/*", "web/**/*"]);
    assert.deepEqual(config.extraResources, [
      { from: "out/legal", to: "legal", filter: ["**/*"] },
    ]);
    assert.equal(config.extraFiles, undefined);
    assert.equal(config.asar, true);
    assert.equal(config.asarUnpack, undefined);
    assert.equal(config.electronVersion, pkg.devDependencies.electron);
    assert.equal(config.npmRebuild, false);
  });

  it("targets: linux dir + AppImage, win nsis + dir, mac dmg + dir", () => {
    assert.deepEqual(targets("linux"), [
      ["dir", "x64"],
      ["AppImage", "x64"],
    ]);
    assert.deepEqual(targets("win"), [
      ["nsis", "x64"],
      ["dir", "x64"],
    ]);
    assert.deepEqual(targets("mac"), [
      ["dmg", "arm64+x64"],
      ["dir", "arm64+x64"],
    ]);
  });

  it("never publishes or auto-updates", () => {
    assert.equal(config.publish, null);
    assert.equal(config.detectUpdateChannel, false);
    assert.equal(config.generateUpdatesFilesForAllChannels, false);
    for (const os of ["linux", "win", "mac"])
      assert.equal(config[os].publish, undefined, `${os}.publish`);
    assert.equal(config.nsis.publish, undefined);
  });

  it("holds no signing identity, certificate or notarization secrets", () => {
    assert.equal(config.mac.identity, null);
    assert.equal(config.mac.notarize, false);
    assert.equal(config.forceCodeSigning, false);
    const keys = [];
    const walk = (o, at) => {
      if (!o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o)) {
        keys.push(`${at}${k}`);
        walk(v, `${at}${k}.`);
      }
    };
    walk(config, "");
    for (const k of keys)
      assert.doesNotMatch(
        k,
        /cert|password|csc|signtool|sign(ing)?Options|azure|keychain|apple|provisioning|entitlements|teamId/i,
        k,
      );
    const src = fs.readFileSync(
      path.join(desktopDir, "electron-builder.config.cjs"),
      "utf8",
    );
    assert.doesNotMatch(src, /process\.env|\.p12|\.pfx|APPLE_|CSC_|WIN_CSC/);
  });

  it("installer output is gitignored", () => {
    const ignore = fs.readFileSync(path.join(desktopDir, ".gitignore"), "utf8");
    assert.ok(ignore.split("\n").includes("dist-installers/"));
  });
});

describe("installer npm scripts", () => {
  const dist = Object.entries(pkg.scripts).filter(([k]) =>
    k.startsWith("dist:"),
  );

  it("are dev-only, per OS, and named for no release step", () => {
    assert.deepEqual(dist.map(([k]) => k).sort(), [
      "dist:linux:dev",
      "dist:mac:dev",
      "dist:win:dev",
    ]);
    for (const k of Object.keys(pkg.scripts))
      assert.doesNotMatch(k, /upload|release|publish|deploy|steam/i);
  });

  it("stage with --dev, never publish, then check the unpacked build", () => {
    for (const [k, cmd] of dist) {
      const steps = cmd.split(" && ");
      assert.equal(steps[0], "node scripts/package.mjs --dev", k);
      assert.match(
        steps[1],
        /^electron-builder --config electron-builder\.config\.cjs --publish never /,
        k,
      );
      assert.match(
        steps[2],
        /^node scripts\/check-installer\.mjs dist-installers\//,
        k,
      );
      assert.equal(steps.length, 3, k);
      assert.doesNotMatch(
        cmd,
        /npm run package|--publish (always|onTag|onTagOrDraft)|steamcmd|--live/,
        k,
      );
    }
    assert.match(pkg.scripts["dist:linux:dev"], /--linux dir AppImage --x64 /);
    assert.match(pkg.scripts["dist:win:dev"], /--win nsis dir --x64 /);
    assert.match(pkg.scripts["dist:mac:dev"], /--mac dmg dir --x64 --arm64 /);
  });

  it("electron-builder is pinned to an exact version", () => {
    assert.match(pkg.devDependencies["electron-builder"], /^\d+\.\d+\.\d+$/);
  });
});

/** Minimal asar writer for fixtures: { "a/b.txt": "text" } -> file. */
function writeAsar(file, entries) {
  const header = { files: {} };
  const bodies = [];
  let offset = 0;
  for (const [p, text] of Object.entries(entries)) {
    const parts = p.split("/");
    let node = header;
    for (const dir of parts.slice(0, -1))
      node = node.files[dir] ??= { files: {} };
    const body = Buffer.from(text);
    node.files[parts.at(-1)] = { size: body.length, offset: String(offset) };
    offset += body.length;
    bodies.push(body);
  }
  const json = Buffer.from(JSON.stringify(header));
  const pad = (4 - (json.length % 4)) % 4;
  const head = Buffer.alloc(16);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(8 + json.length + pad, 4);
  head.writeUInt32LE(4 + json.length + pad, 8);
  head.writeUInt32LE(json.length, 12);
  fs.writeFileSync(
    file,
    Buffer.concat([head, json, Buffer.alloc(pad), ...bodies]),
  );
}

function fakeDist() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pt-dist-"));
  fs.writeFileSync(
    path.join(d, "index.html"),
    "<!doctype html><title>pt</title>",
  );
  return d;
}

/** An unpacked linux build made the way electron-builder lays it out. */
function fakeUnpacked(out) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pt-unpacked-"));
  fs.writeFileSync(path.join(root, "puggietype"), "elf");
  fs.writeFileSync(path.join(root, "LICENSES.chromium.html"), "chromium");
  const res = path.join(root, "resources");
  fs.mkdirSync(res);
  fs.cpSync(path.join(out, "legal"), path.join(res, "legal"), {
    recursive: true,
  });
  const app = path.join(out, "app");
  writeAsar(
    path.join(res, "app.asar"),
    Object.fromEntries(
      scanDepotTree(app).map((f) => [
        f.path,
        fs.readFileSync(path.join(app, f.path), "utf8"),
      ]),
    ),
  );
  return root;
}

describe("unpacked installer check (depot rules)", () => {
  let out;
  let unpacked;
  before(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), "pt-inst-"));
    stagePackage({ distDir: fakeDist(), outDir: out, commit: COMMIT });
    unpacked = fakeUnpacked(out);
  });

  const asarOf = () =>
    asarFileList(path.join(unpacked, "resources", "app.asar"));
  const good = () => ({
    tree: scanDepotTree(unpacked),
    resources: "resources",
    asarFiles: asarOf(),
  });

  it("reads the asar file list from its header", () => {
    const f = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "pt-asar-")),
      "a.asar",
    );
    writeAsar(f, {
      "package.json": "{}",
      "src/main.mjs": "",
      "web/x/y.js": "1",
    });
    assert.deepEqual(asarFileList(f), [
      "package.json",
      "src/main.mjs",
      "web/x/y.js",
    ]);
  });

  it("the staged app packed like electron-builder passes", () => {
    assert.deepEqual(installerViolations(good()), []);
    assert.equal(checkInstaller(unpacked).resources, "resources");
    for (const n of LEGAL_FILES) assert.ok(asarOf().includes(`web/legal/${n}`));
  });

  for (const bad of [
    "steam-ticket-helper",
    "resources/steam-ticket-helper/steam-ticket-helper.exe",
    "libsteam_api.so",
    "resources/steam_api64.dll",
    "steam_appid.txt",
    "resources/ads.txt",
  ]) {
    it(`rejects ${bad} in the build`, () => {
      const g = good();
      g.tree.push({ path: bad, size: 1, type: "file" });
      assert.match(installerViolations(g).join("\n"), /forbidden/);
    });
  }

  for (const bad of [
    "web/ads.txt",
    "web/steam_appid.txt",
    "src/steam_api.node",
  ]) {
    it(`rejects ${bad} inside app.asar`, () => {
      const g = good();
      g.asarFiles.push(bad);
      assert.match(installerViolations(g).join("\n"), /forbidden/);
    });
  }

  it("rejects a missing, empty or extra legal file", () => {
    const missing = good();
    missing.tree = missing.tree.filter(
      (f) => f.path !== "resources/legal/SOURCE.txt",
    );
    assert.match(
      installerViolations(missing).join("\n"),
      /legal\/SOURCE\.txt: missing/,
    );
    const empty = good();
    empty.tree.find((f) => f.path === "resources/legal/NOTICE.txt").size = 0;
    assert.match(installerViolations(empty).join("\n"), /NOTICE\.txt: empty/);
    const extra = good();
    extra.tree.push({ path: "resources/legal/x.txt", size: 1, type: "file" });
    assert.match(installerViolations(extra).join("\n"), /only LEGAL_FILES/);
  });

  it("rejects an unpacked app, a missing asar or strays in it", () => {
    const g = good();
    g.tree.push({
      path: "resources/app.asar.unpacked/a.node",
      size: 1,
      type: "file",
    });
    g.tree.push({ path: "resources/app/package.json", size: 1, type: "file" });
    assert.equal(
      installerViolations(g).filter((v) => v.includes("app.asar only")).length,
      2,
    );
    const noAsar = good();
    noAsar.tree = noAsar.tree.filter((f) => f.path !== "resources/app.asar");
    assert.match(installerViolations(noAsar).join("\n"), /app\.asar: missing/);
    const stray = good();
    stray.asarFiles.push("node_modules/x/index.js");
    assert.match(
      installerViolations(stray).join("\n"),
      /outside package\.json/,
    );
    const noWeb = good();
    noWeb.asarFiles = noWeb.asarFiles.filter((p) => p !== "web/index.html");
    assert.match(
      installerViolations(noWeb).join("\n"),
      /web\/index\.html: missing/,
    );
  });

  it("finds resources on linux/win and in a mac .app", () => {
    assert.equal(findResources(unpacked), "resources");
    const mac = fs.mkdtempSync(path.join(os.tmpdir(), "pt-mac-"));
    fs.mkdirSync(path.join(mac, "PuggieType.app", "Contents", "Resources"), {
      recursive: true,
    });
    assert.equal(findResources(mac), "PuggieType.app/Contents/Resources");
  });
});
