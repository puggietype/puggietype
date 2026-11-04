import { Plugin } from "vite";
import path from "node:path";
import {
  existsSync,
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
 * and, on the web build, the steam-only background music (static/music).
 */
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
      if (options.platform !== "steam") {
        // background music (static/music) ships with the steam build only
        rmSync(path.join(outDir, "music"), { recursive: true, force: true });
        return;
      }
      const removed = stripSteamAssets(outDir);
      console.log(
        `steam asset clearance: removed ${removed.sounds} sound paths, ${removed.quotes} lyric quotes`,
      );
    },
  };
}

export function stripSteamAssets(outDir: string): {
  sounds: number;
  quotes: number;
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
  return { sounds, quotes };
}
