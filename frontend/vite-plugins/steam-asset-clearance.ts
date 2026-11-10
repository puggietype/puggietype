import { createRequire } from "node:module";
import { Plugin } from "vite";
import path from "node:path";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { steamExcludedSoundPaths } from "../src/ts/constants/sound-clearance";
import { filterLyricQuotes, QuoteLike } from "../src/ts/constants/lyric-quotes";

/**
 * steam build only: strips assets Legal has not cleared from the output
 * (static/ is copied verbatim by vite's publicDir):
 * - untraced sound packs (docs/sounds-SOURCES.md)
 * - song-lyric quotes (constants/lyric-quotes.ts)
 * - AdSense account metadata (ads.txt and google-adsense-account meta).
 *   The website build does not run this.
 * Font Awesome subset woff2 files stay (the UI uses them). Their upstream
 * LICENSE.txt is copied beside the other webfont licenses.
 */

/** Stable path inside the steam web root. Byte copy of the dependency license. */
export const FONT_AWESOME_LICENSE_REL =
  "webfonts/licenses/FontAwesome-Free-LICENSE.txt";

const FONT_AWESOME_FONT = /^fa-(?:solid|regular|brands)-.+\.woff2$/;
const AD_ACCOUNT_META =
  /<meta\b[^>]*\bname\s*=\s*["']google-adsense-account["'][^>]*>/gi;
export function steamAssetClearance(options: {
  platform: "web" | "steam";
}): Plugin {
  let outDir = path.resolve("./dist");
  return {
    name: "steam-asset-clearance",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      // background music (static/music) ships with both builds; it is
      // fetched only when music is on and after a user gesture
      if (options.platform !== "steam") return;
      const removed = stripSteamAssets(outDir);
      console.log(
        `steam asset clearance: removed ${removed.sounds} sound paths, ${removed.quotes} lyric quotes, ${removed.adMetaTags} ad account meta tags${removed.adsTxt ? ", ads.txt" : ""}${removed.fontAwesomeLicense ? "; bundled Font Awesome Free license" : ""}`,
      );
    },
  };
}

function walkHtml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkHtml(child));
    else if (ent.isFile() && ent.name.endsWith(".html")) out.push(child);
  }
  return out;
}

function fontAwesomeUpstreamLicense(): string {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve("@fortawesome/fontawesome-free/package.json");
  return path.join(path.dirname(pkg), "LICENSE.txt");
}

export function stripSteamAssets(outDir: string): {
  sounds: number;
  quotes: number;
  adsTxt: boolean;
  adMetaTags: number;
  fontAwesomeLicense: boolean;
} {
  let sounds = 0;
  for (const rel of steamExcludedSoundPaths()) {
    const target = path.join(outDir, "sounds", rel);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      sounds++;
    }
  }

  let quotes = 0;
  const quotesDir = path.join(outDir, "quotes");
  if (existsSync(quotesDir)) {
    for (const file of readdirSync(quotesDir)) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(quotesDir, file);
      const data = JSON.parse(readFileSync(filePath, "utf8")) as {
        quotes?: QuoteLike[];
      };
      if (!Array.isArray(data.quotes)) continue;
      const kept = filterLyricQuotes(
        data.quotes,
        file.slice(0, -".json".length),
      );
      if (kept.length === data.quotes.length) continue;
      quotes += data.quotes.length - kept.length;
      writeFileSync(filePath, JSON.stringify({ ...data, quotes: kept }));
    }
  }

  const adsPath = path.join(outDir, "ads.txt");
  const adsTxt = existsSync(adsPath);
  if (adsTxt) rmSync(adsPath);

  let adMetaTags = 0;
  for (const file of walkHtml(outDir)) {
    const html = readFileSync(file, "utf8");
    AD_ACCOUNT_META.lastIndex = 0;
    const next = html.replace(AD_ACCOUNT_META, () => {
      adMetaTags += 1;
      return "";
    });
    if (next !== html) writeFileSync(file, next);
  }

  const webfonts = path.join(outDir, "webfonts");
  const fontAwesomeFonts = existsSync(webfonts)
    ? readdirSync(webfonts).filter((name) => FONT_AWESOME_FONT.test(name))
    : [];
  let fontAwesomeLicense = false;
  if (fontAwesomeFonts.length > 0) {
    const src = fontAwesomeUpstreamLicense();
    if (!existsSync(src)) {
      throw new Error(`Font Awesome Free license missing: ${src}`);
    }
    const dest = path.join(outDir, FONT_AWESOME_LICENSE_REL);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    fontAwesomeLicense = true;
  }

  return { sounds, quotes, adsTxt, adMetaTags, fontAwesomeLicense };
}
