import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  FONT_AWESOME_LICENSE_REL,
  FONT_AWESOME_MIT_REL,
  FONT_AWESOME_OFL_REL,
  steamAssetClearance,
  stripSteamAssets,
} from "../../vite-plugins/steam-asset-clearance";

const require = createRequire(import.meta.url);
const repoFrontend = path.resolve(__dirname, "../..");
const adsTxt = readFileSync(path.join(repoFrontend, "static/ads.txt"), "utf8");
const prettyHtml = readFileSync(
  path.join(repoFrontend, "src/index.html"),
  "utf8",
);
const fontAwesomeRoot = path.dirname(
  require.resolve("@fortawesome/fontawesome-free/package.json"),
);
const upstreamLicense = readFileSync(path.join(fontAwesomeRoot, "LICENSE.txt"));
const upstreamFont = readFileSync(
  path.join(fontAwesomeRoot, "webfonts/fa-regular-400.woff2"),
);
const noticesDir = path.join(repoFrontend, "vite-plugins/notices");
const oflNotice = readFileSync(
  path.join(noticesDir, "FontAwesome-Free-OFL.txt"),
);
const mitNotice = readFileSync(
  path.join(noticesDir, "FontAwesome-Free-MIT.txt"),
);
const oflFull = readFileSync(path.join(noticesDir, "SIL-OFL-1.1.txt"), "utf8");
const oflStandardBody = oflFull.slice(
  oflFull.indexOf(
    "-----------------------------------------------------------\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n",
  ),
);
const mitPermission = readFileSync(
  path.join(noticesDir, "MIT-permission.txt"),
  "utf8",
);
const scssLines = readFileSync(
  path.join(fontAwesomeRoot, "scss/fontawesome.scss"),
  "utf8",
).split(/\r?\n/);
const upstreamByline = `${scssLines[1]}\n${scssLines[2]}\n`;
const MIT_FIRST_LINE =
  "SCSS from @fortawesome/fontawesome-free 5.15.4, compiled into this app's CSS. Attribution below reproduced from upstream scss/fontawesome.scss:";
/** Bytes after the first newline of FontAwesome-Free-MIT.txt at 59f34a8. */
const MIT_REST_SHA256 =
  "5fb8b0c36e0aef94d977da88d6df56e2331149ad78dcc49613f67f54eb0fa1e5";

function expectMitWording(bytes: Buffer): void {
  const nl = bytes.indexOf(0x0a);
  expect(nl).toBeGreaterThan(0);
  expect(bytes.subarray(0, nl).toString("utf8")).toBe(MIT_FIRST_LINE);
  expect(sha256(bytes.subarray(nl + 1))).toBe(MIT_REST_SHA256);
}

/** Minified shape vite actually writes (no slash, no extra space). */
const MINIFIED_PAGE = [
  '<!doctype html><html lang="en"><head>',
  '<meta charset="UTF-8">',
  '<meta name="google-adsense-account" content="ca-pub-8233445679738428">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  "<title>Terms of Service | PuggieType</title></head><body></body></html>",
].join("");

const MINIFIED_KEPT = [
  '<!doctype html><html lang="en"><head>',
  '<meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  "<title>Terms of Service | PuggieType</title></head><body></body></html>",
].join("");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function writePayload(dir: string): void {
  writeFileSync(path.join(dir, "ads.txt"), adsTxt);
  writeFileSync(
    path.join(dir, "0ee4e9e83d311fae5b2a9062e73dcb43.txt"),
    "0ee4e9e83d311fae5b2a9062e73dcb43\n",
  );
  writeFileSync(path.join(dir, "index.html"), prettyHtml);
  mkdirSync(path.join(dir, "guide"), { recursive: true });
  writeFileSync(path.join(dir, "guide/about.html"), MINIFIED_PAGE);
  mkdirSync(path.join(dir, "webfonts"), { recursive: true });
  writeFileSync(
    path.join(dir, "webfonts/fa-regular-400-CPEIu2bx.woff2"),
    upstreamFont,
  );
  writeFileSync(path.join(dir, "webfonts/Lexend-Regular.woff2"), "lexend");
}

function runCloseBundle(platform: "web" | "steam", outDir: string): void {
  const plugin = steamAssetClearance({ platform }) as {
    configResolved: (config: unknown) => void;
    closeBundle: () => void;
  };
  plugin.configResolved({ root: "/", build: { outDir } });
  plugin.closeBundle();
}

describe("steam payload ad inventory and Font Awesome license", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("strips ads.txt and the adsense account meta, and bundles the upstream license next to the emitted fonts", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "steam-payload-"));
    writePayload(dir);
    const fontPath = path.join(dir, "webfonts/fa-regular-400-CPEIu2bx.woff2");
    const fontHash = sha256(readFileSync(fontPath));

    const result = stripSteamAssets(dir);

    expect(existsSync(path.join(dir, "ads.txt"))).toBe(false);
    expect(result.adsTxt).toBe(true);
    expect(result.adMetaTags).toBe(2);
    const index = readFileSync(path.join(dir, "index.html"), "utf8");
    const about = readFileSync(path.join(dir, "guide/about.html"), "utf8");
    expect(index).not.toMatch(/google-adsense-account|ca-pub-/);
    expect(index).toContain('name="theme-color"');
    expect(about).toBe(MINIFIED_KEPT);
    expect(
      readFileSync(
        path.join(dir, "0ee4e9e83d311fae5b2a9062e73dcb43.txt"),
        "utf8",
      ),
    ).toBe("0ee4e9e83d311fae5b2a9062e73dcb43\n");
    expect(sha256(readFileSync(fontPath))).toBe(fontHash);
    expect(
      readFileSync(path.join(dir, "webfonts/Lexend-Regular.woff2"), "utf8"),
    ).toBe("lexend");
    const shipped = readFileSync(path.join(dir, FONT_AWESOME_LICENSE_REL));
    expect(shipped.equals(upstreamLicense)).toBe(true);
    expect(sha256(shipped)).toBe(sha256(upstreamLicense));
    expect(shipped.toString("utf8")).toContain("Font Awesome Free License");
    expect(shipped.toString("utf8")).toContain("SIL OFL 1.1");
    expect(sha256(shipped)).toBe(
      "e779748dfe75e84f974df3c7bc07f842011a100159158b0f1f49b2f2a5a515cb",
    );
    expect(result.fontAwesomeLicense).toBe(true);
    const oflOut = readFileSync(path.join(dir, FONT_AWESOME_OFL_REL));
    const mitOut = readFileSync(path.join(dir, FONT_AWESOME_MIT_REL));
    expect(oflOut.equals(oflNotice)).toBe(true);
    expect(mitOut.equals(mitNotice)).toBe(true);
    const oflText = oflOut.toString("utf8");
    expect(oflText).toContain("5.15.4");
    expect(oflText).toContain("\nCopyright (c) Font Awesome\n");
    expect(oflText.endsWith(oflStandardBody)).toBe(true);
    expect(oflText).not.toContain("with Reserved Font Name");
    expect(oflText).toContain(
      '"Reserved Font Name" refers to any names specified as such after the\ncopyright statement(s).',
    );
    const mitText = mitOut.toString("utf8");
    expect(mitText).toContain(upstreamByline);
    expect(mitText).toContain(mitPermission);
    expect(mitText).not.toContain("Copyright <YEAR>");
    expect(mitText).not.toContain("<COPYRIGHT HOLDER>");
    expect(mitText).not.toContain("Fonticons");
    expect(existsSync(path.join(dir, "webfonts/licenses/README.md"))).toBe(
      false,
    );
  });

  it("uses the compiled-SCSS first line and leaves the rest of the MIT notice unchanged", () => {
    expectMitWording(mitNotice);
    dir = mkdtempSync(path.join(os.tmpdir(), "steam-payload-"));
    mkdirSync(path.join(dir, "webfonts"), { recursive: true });
    writeFileSync(
      path.join(dir, "webfonts/fa-regular-400-CPEIu2bx.woff2"),
      upstreamFont,
    );
    stripSteamAssets(dir);
    expectMitWording(readFileSync(path.join(dir, FONT_AWESOME_MIT_REL)));
  });

  it("does not add a Font Awesome license when no Font Awesome font was emitted", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "steam-payload-"));
    mkdirSync(path.join(dir, "webfonts"), { recursive: true });
    writeFileSync(path.join(dir, "webfonts/Lexend-Regular.woff2"), "lexend");
    const result = stripSteamAssets(dir);
    expect(result.fontAwesomeLicense).toBe(false);
    expect(existsSync(path.join(dir, FONT_AWESOME_LICENSE_REL))).toBe(false);
    expect(existsSync(path.join(dir, FONT_AWESOME_OFL_REL))).toBe(false);
    expect(existsSync(path.join(dir, FONT_AWESOME_MIT_REL))).toBe(false);
  });

  it("runs that strip from the steam build plugin and leaves the web build untouched", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "steam-payload-"));
    writePayload(dir);
    runCloseBundle("steam", dir);
    expect(existsSync(path.join(dir, "ads.txt"))).toBe(false);
    expect(readFileSync(path.join(dir, "guide/about.html"), "utf8")).toBe(
      MINIFIED_KEPT,
    );
    expect(
      readFileSync(path.join(dir, FONT_AWESOME_LICENSE_REL)).equals(
        upstreamLicense,
      ),
    ).toBe(true);
    expect(
      readFileSync(path.join(dir, FONT_AWESOME_OFL_REL)).equals(oflNotice),
    ).toBe(true);
    expect(
      readFileSync(path.join(dir, FONT_AWESOME_MIT_REL)).equals(mitNotice),
    ).toBe(true);

    const web = mkdtempSync(path.join(os.tmpdir(), "web-payload-"));
    try {
      writePayload(web);
      runCloseBundle("web", web);
      expect(readFileSync(path.join(web, "ads.txt"), "utf8")).toBe(adsTxt);
      expect(readFileSync(path.join(web, "index.html"), "utf8")).toBe(
        prettyHtml,
      );
      expect(readFileSync(path.join(web, "guide/about.html"), "utf8")).toBe(
        MINIFIED_PAGE,
      );
      expect(existsSync(path.join(web, FONT_AWESOME_LICENSE_REL))).toBe(false);
      expect(existsSync(path.join(web, FONT_AWESOME_OFL_REL))).toBe(false);
      expect(existsSync(path.join(web, FONT_AWESOME_MIT_REL))).toBe(false);
      expect(
        readFileSync(
          path.join(web, "webfonts/fa-regular-400-CPEIu2bx.woff2"),
        ).equals(upstreamFont),
      ).toBe(true);
    } finally {
      rmSync(web, { recursive: true, force: true });
    }
  });
});
