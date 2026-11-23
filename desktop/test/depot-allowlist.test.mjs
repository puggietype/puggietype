import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DLC_DEPOT_PATH,
  REQUIRED_FILE_EXCLUSIONS,
  STEAM_PLACEHOLDERS,
  assertDepotAllowlist,
  assertDepotTemplates,
  depotTemplateViolations,
  depotViolations,
  parseVdf,
} from "../scripts/depot-allowlist.mjs";
import { stagePackage } from "../scripts/package.mjs";
import { readSteamIds, renderSteamVdf } from "../scripts/render-steam-vdf.mjs";
import { LEGAL_FILES } from "../src/shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const repoRoot = path.resolve(desktopDir, "..");
const steamDir = path.join(desktopDir, "steam");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function fakeDist() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pt-dist-"));
  fs.writeFileSync(
    path.join(d, "index.html"),
    "<!doctype html><title>pt</title>",
  );
  return d;
}

function stage() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pt-depot-"));
  stagePackage({ distDir: fakeDist(), outDir: out, commit: COMMIT });
  return out;
}

function plant(root, rel, body = "x") {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

function fakeDlc(extra = []) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pt-dlc-"));
  fs.copyFileSync(
    path.join(repoRoot, "assets", "supporter", "LICENSE"),
    path.join(d, "LICENSE"),
  );
  for (const f of ["pug-cape.png", "hats/top-hat.webp", "banner.jpg"])
    plant(d, f, "img");
  for (const f of extra) plant(d, f);
  return d;
}

const readTemplates = () =>
  Object.fromEntries(
    ["app_build", "depot_content", "depot_dlc"].map((n) => [
      n,
      fs.readFileSync(path.join(steamDir, `${n}.vdf.template`), "utf8"),
    ]),
  );

// Red/green story: the clean staged tree passes; the same tree with one
// held (PR #37) helper/SDK file, or a stray file outside app/ and legal/,
// fails. Legal 2026-11-04: "depot allowlist and redistributables re-review
// when the depot step lands".
describe("content depot allowlist (red/green on a staged tree)", () => {
  let clean;
  before(() => {
    clean = stage();
  });

  it("green: a normal stagePackage() output passes", () => {
    assert.doesNotThrow(() =>
      assertDepotAllowlist({ depot: "content", root: clean }),
    );
  });

  const forbidden = [
    // held PR #37 helper and Steamworks redistributables, wherever they land
    "app/resources/steam-ticket-helper/steam-ticket-helper.exe",
    "app/resources/steam-ticket-helper/README.txt",
    "app/steam-ticket-helper",
    "app/steam-ticket-helper.exe",
    "app/steam_api64.dll",
    "app/steam_api.dll",
    "app/libsteam_api.so",
    "app/libsteam_api.dylib",
    "app/web/steam_api64.lib",
    "app/STEAM_API64.DLL",
    "app/steam_appid.txt",
    "app/web/ads.txt",
    "legal/steam_api.dll",
    "legal/steam_appid.txt",
    // outside app/ and legal/
    "steam_api64.dll",
    "stray.txt",
    "resources/steam-ticket-helper/steam-ticket-helper",
    "sibling/readme.txt",
    // legal/ holds exactly LEGAL_FILES
    "legal/extra.txt",
    "legal/sub/LICENSE.txt",
  ];
  for (const rel of forbidden) {
    it(`red: fails with ${rel} planted`, () => {
      const out = stage();
      assertDepotAllowlist({ depot: "content", root: out });
      plant(out, rel);
      assert.throws(
        () => assertDepotAllowlist({ depot: "content", root: out }),
        (err) => err.message.includes(rel),
      );
    });
  }

  it("red: a missing or empty legal file fails", () => {
    for (const f of LEGAL_FILES) {
      const out = stage();
      fs.rmSync(path.join(out, "legal", f));
      assert.throws(
        () => assertDepotAllowlist({ depot: "content", root: out }),
        new RegExp(`legal/${f.replace(".", "\\.")}`),
      );
      fs.writeFileSync(path.join(out, "legal", f), "");
      assert.throws(
        () => assertDepotAllowlist({ depot: "content", root: out }),
        /empty/,
      );
    }
  });

  it("red: a symlink in the tree fails (SteamPipe would follow it)", () => {
    const out = stage();
    fs.symlinkSync("/etc/hostname", path.join(out, "app", "link"));
    assert.throws(
      () => assertDepotAllowlist({ depot: "content", root: out }),
      /app\/link: not a regular file/,
    );
  });

  it("stagePackage refuses to produce a tree that fails the allowlist", () => {
    const dist = fakeDist();
    plant(dist, "steam_api64.dll");
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-depot-"));
    assert.throws(
      () => stagePackage({ distDir: dist, outDir, commit: COMMIT }),
      /app\/web\/steam_api64\.dll/,
    );
    assert.equal(fs.existsSync(outDir), false, "bad tree is removed");
  });

  it("the pure check reports every violation, not just the first", () => {
    const v = depotViolations("content", [
      { path: "a.txt", size: 1, type: "file" },
      { path: "app/steam_appid.txt", size: 1, type: "file" },
    ]);
    assert.ok(v.some((s) => s.startsWith("a.txt")));
    assert.ok(v.some((s) => s.startsWith("app/steam_appid.txt")));
    assert.ok(v.some((s) => s.startsWith("legal/LICENSE.txt")));
    assert.throws(() => depotViolations("nope", []), /unknown depot/);
  });
});

describe("DLC (Supporter Pack) depot allowlist", () => {
  it("green: licence plus png/jpg/jpeg/webp/gif art passes", () => {
    const d = fakeDlc(["a.gif", "b.jpeg", "C.PNG"]);
    assert.doesNotThrow(() => assertDepotAllowlist({ depot: "dlc", root: d }));
  });

  it("green: today's assets/supporter/ (licence only) passes", () => {
    assertDepotAllowlist({
      depot: "dlc",
      root: path.join(repoRoot, "assets", "supporter"),
    });
  });

  for (const rel of [
    "mod.js",
    "mod.mjs",
    "steam-ticket-helper.exe",
    "steam_api64.dll",
    "libsteam_api.so",
    "index.html",
    "click.wav",
    "notes.txt",
    "art.svg",
    "steam_appid.txt",
    "hats/LICENSE",
    "steam-ticket-helper/cape.png",
  ]) {
    it(`red: fails with ${rel} planted`, () => {
      const d = fakeDlc([rel]);
      assert.throws(
        () => assertDepotAllowlist({ depot: "dlc", root: d }),
        (err) => err.message.includes(rel),
      );
    });
  }

  it("red: art without its licence fails", () => {
    const d = fakeDlc();
    fs.rmSync(path.join(d, "LICENSE"));
    assert.throws(
      () => assertDepotAllowlist({ depot: "dlc", root: d }),
      /licence/,
    );
  });
});

describe("committed SteamPipe templates", () => {
  it("green: the committed templates pass", () => {
    assert.doesNotThrow(() => assertDepotTemplates(readTemplates()));
  });

  it("only the three known templates are committed", () => {
    assert.deepEqual(
      fs
        .readdirSync(steamDir)
        .filter((f) => f.endsWith(".template"))
        .sort(),
      [
        "app_build.vdf.template",
        "depot_content.vdf.template",
        "depot_dlc.vdf.template",
      ],
    );
  });

  it("use placeholders only, never a numeric id, and say so", () => {
    const t = readTemplates();
    const app = parseVdf(t.app_build).AppBuild;
    assert.equal(app.AppID, STEAM_PLACEHOLDERS.app);
    assert.deepEqual(Object.keys(app.Depots).sort(), [
      STEAM_PLACEHOLDERS.content,
      STEAM_PLACEHOLDERS.dlc,
    ]);
    assert.equal(
      parseVdf(t.depot_content).DepotBuild.DepotID,
      STEAM_PLACEHOLDERS.content,
    );
    assert.equal(
      parseVdf(t.depot_dlc).DepotBuild.DepotID,
      STEAM_PLACEHOLDERS.dlc,
    );
    for (const text of Object.values(t)) {
      assert.match(text, /placeholder/i);
      assert.match(text, /no App ID yet/);
      assert.match(text, /Lead and Jake/);
      assert.doesNotMatch(text, /"\s*\d{3,}\s*"/);
    }
  });

  it("never auto-publish: SetLive is empty and Preview is on", () => {
    const app = parseVdf(readTemplates().app_build).AppBuild;
    assert.equal(app.SetLive, "");
    assert.equal(app.Preview, "1");
  });

  it("depot scripts exclude debug symbols and OS junk", () => {
    const t = readTemplates();
    for (const n of ["depot_content", "depot_dlc"]) {
      const ex = parseVdf(t[n]).DepotBuild.FileExclusion;
      for (const e of REQUIRED_FILE_EXCLUSIONS)
        assert.ok([ex].flat().includes(e), `${n}: ${e}`);
    }
  });

  // Each edit below widens or moves a mapping; every one must fail.
  const widen = [
    [
      "content: LocalPath * at the content root",
      "depot_content",
      /"LocalPath"\s+"app\/\*"/,
      '"LocalPath" "*"',
    ],
    [
      "content: ContentRoot at the repo root",
      "depot_content",
      /"ContentRoot"\s+"[^"]*"/,
      '"ContentRoot" "../../../"',
    ],
    [
      "content: a helper folder mapping",
      "depot_content",
      /"LocalPath"\s+"legal\/\*"/,
      '"LocalPath" "resources/steam-ticket-helper/*"',
    ],
    [
      "content: a steam_api mapping inside app/",
      "depot_content",
      /"LocalPath"\s+"app\/\*"/,
      '"LocalPath" "app/steam_api64.dll"',
    ],
    [
      "content: escaping with ..",
      "depot_content",
      /"LocalPath"\s+"app\/\*"/,
      '"LocalPath" "app/../../*"',
    ],
    [
      "content: app/ files landing at the depot root",
      "depot_content",
      /"DepotPath"\s+"app"/,
      '"DepotPath" "."',
    ],
    [
      "dlc: LocalPath *",
      "depot_dlc",
      /"LocalPath"\s+"\*\.png"/,
      '"LocalPath" "*"',
    ],
    [
      "dlc: ContentRoot at the repo root",
      "depot_dlc",
      /"ContentRoot"\s+"[^"]*"/,
      '"ContentRoot" "../../../"',
    ],
    [
      "dlc: a script mapping",
      "depot_dlc",
      /"LocalPath"\s+"\*\.png"/,
      '"LocalPath" "*.js"',
    ],
    [
      "dlc: art written into app/",
      "depot_dlc",
      new RegExp(`"DepotPath"\\s+"${DLC_DEPOT_PATH}"`),
      '"DepotPath" "app"',
    ],
    [
      "app build: SetLive default",
      "app_build",
      /"SetLive"\s+""/,
      '"SetLive" "default"',
    ],
    ["app build: Preview off", "app_build", /"Preview"\s+"1"/, '"Preview" "0"'],
    [
      "app build: a real-looking App ID",
      "app_build",
      /"AppID"\s+"__PUGGIE_STEAM_APP_ID__"/,
      '"AppID" "480"',
    ],
  ];
  for (const [name, file, from, to] of widen) {
    it(`red: ${name}`, () => {
      const t = readTemplates();
      assert.match(t[file], from, "fixture edit must apply");
      t[file] = t[file].replace(from, to);
      assert.ok(depotTemplateViolations(t).length > 0);
      assert.throws(() => assertDepotTemplates(t));
    });
  }
});

describe("VDF parser", () => {
  it("parses quoted keys, nesting, comments and repeated keys", () => {
    const v = parseVdf(
      '// c\n"A"\n{\n  "k" "v" // c\n  "r" "1"\n  "r" "2"\n  "n" { "x" "y" }\n}\n',
    );
    assert.deepEqual(v, { A: { k: "v", r: ["1", "2"], n: { x: "y" } } });
  });

  it("rejects malformed input", () => {
    assert.throws(() => parseVdf('"A" {'), /unclosed/);
    assert.throws(() => parseVdf('"A" }'), /unexpected/);
    assert.throws(() => parseVdf('"A'), /unterminated/);
  });
});

describe("render helper (placeholders only, no upload)", () => {
  const ids = { app: "1000010", content: "1000011", dlc: "1000012" };

  it("substitutes every placeholder", () => {
    const t = readTemplates();
    const out = renderSteamVdf(t.app_build, ids);
    assert.doesNotMatch(out, /__PUGGIE_/);
    assert.match(out, /"AppID"\s+"1000010"/);
  });

  it("refuses empty, non-digit, zero, duplicate or missing ids", () => {
    const t = readTemplates().app_build;
    for (const bad of ["", " ", "0", "00", "480x", "-1", "1e3", "0480"]) {
      assert.throws(() => renderSteamVdf(t, { ...ids, app: bad }), /app/);
    }
    assert.throws(() => renderSteamVdf(t, { ...ids, dlc: ids.content }));
    assert.throws(() => renderSteamVdf(t, { app: "1", content: "2" }), /dlc/);
  });

  it("refuses if any placeholder would remain", () => {
    assert.throws(
      () => renderSteamVdf('"X" "__PUGGIE_STEAM_OTHER_ID__"', ids),
      /placeholder/,
    );
  });

  it("reads ids from env over the local file, never from defaults", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-ids-"));
    const file = path.join(dir, "ids.local.json");
    assert.deepEqual(readSteamIds({ env: {}, file }), {
      app: undefined,
      content: undefined,
      dlc: undefined,
    });
    fs.writeFileSync(file, JSON.stringify({ app: "7", content: "8" }));
    assert.deepEqual(
      readSteamIds({ env: { PUGGIE_STEAM_APP_ID: "9" }, file }),
      { app: "9", content: "8", dlc: undefined },
    );
  });

  it("never spawns anything (no steamcmd, no upload)", () => {
    for (const f of ["render-steam-vdf.mjs", "depot-allowlist.mjs"]) {
      const src = fs.readFileSync(path.join(desktopDir, "scripts", f), "utf8");
      assert.doesNotMatch(src, /child_process|steamcmd|run_app_build/i, f);
    }
    const pkg = JSON.parse(
      fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"),
    );
    for (const s of Object.keys(pkg.scripts))
      assert.doesNotMatch(s, /upload|release|publish|deploy|steam/i);
  });

  it("rendered output and the ids file are gitignored", () => {
    const gi = fs.readFileSync(path.join(desktopDir, ".gitignore"), "utf8");
    for (const p of ["steam/build/", "steam/*.vdf", "steam/ids.local.json"])
      assert.ok(gi.split("\n").includes(p), p);
  });
});
