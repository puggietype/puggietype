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
import { getDefaultConfig } from "../../src/ts/constants/default-config";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isClickSoundExcluded,
  isErrorSoundExcluded,
  steamExcludedSoundPaths,
  UNTRACED_CLICK_SOUNDS,
} from "../../src/ts/constants/sound-clearance";
import { clickSoundConfig } from "../../src/ts/constants/sounds";
import {
  isSoundOptionHidden,
  resetExcludedSounds,
} from "../../src/ts/steam/asset-clearance";
import { stripSteamAssets } from "../../vite-plugins/steam-asset-clearance";

const soundsDir = path.resolve(__dirname, "../../static/sounds");

describe("sound clearance lists", () => {
  it("covers every file-backed click pack and nothing synthesized", () => {
    expect([...UNTRACED_CLICK_SOUNDS].sort()).toEqual(
      Object.keys(clickSoundConfig).sort(),
    );
    for (const synth of ["8", "9", "10", "11", "12", "13"]) {
      expect(isClickSoundExcluded(synth, "steam")).toBe(false);
    }
  });

  it("no longer lists sounds #17 removed from the repo", () => {
    const excluded = steamExcludedSoundPaths();
    for (const gone of ["click6", "click7", "click16", "fart-reverb.wav"]) {
      expect(excluded).not.toContain(gone);
      expect(existsSync(path.join(soundsDir, gone)), gone).toBe(false);
    }
  });

  it("excludes only on steam", () => {
    expect(isClickSoundExcluded("1", "web")).toBe(false);
    expect(isClickSoundExcluded("1", "steam")).toBe(true);
    expect(isErrorSoundExcluded("1", "steam")).toBe(true);
    expect(isErrorSoundExcluded("2", "steam")).toBe(false);
    expect(isErrorSoundExcluded("3", "steam")).toBe(false);
    expect(isErrorSoundExcluded("4", "steam")).toBe(true);
  });

  it("lists paths that exist and agree with SOURCES.md", () => {
    const sources = readFileSync(path.join(soundsDir, "SOURCES.md"), "utf8");
    for (const rel of steamExcludedSoundPaths()) {
      expect(existsSync(path.join(soundsDir, rel)), rel).toBe(true);
      expect(sources).toContain(`\`${rel}`);
    }
    const untraced = sources
      .split("\n")
      .filter((l) => l.startsWith("| `") && l.includes("| UNTRACED |"));
    const traced = sources
      .split("\n")
      .filter((l) => l.startsWith("| `") && l.includes("| TRACED |"));
    expect(untraced).toHaveLength(153);
    expect(traced.map((l) => l.split("`")[1])).toEqual([
      "error2/1.wav",
      "error3/1.wav",
    ]);
  });
});

describe("steam option hiding", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("hides untraced options on steam only", () => {
    expect(isSoundOptionHidden("playSoundOnClick", "5", "steam")).toBe(true);
    expect(isSoundOptionHidden("playSoundOnClick", "8", "steam")).toBe(false);
    expect(isSoundOptionHidden("playSoundOnClick", "off", "steam")).toBe(false);
    expect(isSoundOptionHidden("playSoundOnClick", "5", "web")).toBe(false);
    expect(isSoundOptionHidden("playTimeWarning", "3", "steam")).toBe(true);
    expect(isSoundOptionHidden("playTimeWarning", "off", "steam")).toBe(false);
    expect(isSoundOptionHidden("fontSize", 2, "steam")).toBe(false);
  });

  it("reads the build platform by default", () => {
    vi.stubGlobal("__PLATFORM__", "steam");
    expect(isSoundOptionHidden("playSoundOnClick", "1")).toBe(true);
    vi.stubGlobal("__PLATFORM__", "web");
    expect(isSoundOptionHidden("playSoundOnClick", "1")).toBe(false);
  });

  it("resets synced web configs that pick excluded sounds", () => {
    const config = {
      ...getDefaultConfig(),
      playSoundOnClick: "17",
      playSoundOnError: "4",
      playTimeWarning: "5",
    } as const;
    const steam = resetExcludedSounds({ ...config }, "steam");
    expect(steam.playSoundOnClick).toBe("off");
    expect(steam.playSoundOnError).toBe("off");
    expect(steam.playTimeWarning).toBe("off");
    expect(resetExcludedSounds({ ...config }, "web")).toEqual(config);
    const kept = resetExcludedSounds(
      { ...config, playSoundOnClick: "11", playSoundOnError: "2" },
      "steam",
    );
    expect(kept.playSoundOnClick).toBe("11");
    expect(kept.playSoundOnError).toBe("2");
  });
});

describe("steam build output stripping", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("removes untraced sounds and lyric quotes, keeping everything else", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "steam-strip-"));
    mkdirSync(path.join(dir, "sounds/click1"), { recursive: true });
    mkdirSync(path.join(dir, "sounds/error2"), { recursive: true });
    mkdirSync(path.join(dir, "quotes"));
    writeFileSync(path.join(dir, "sounds/click1/1.wav"), "x");
    writeFileSync(path.join(dir, "sounds/error2/1.wav"), "x");
    writeFileSync(path.join(dir, "sounds/timeWarning.wav"), "x");
    const quotes = {
      language: "english",
      groups: [[0, 100]],
      quotes: [
        { id: 1, text: "a", source: "Hey Jude", length: 1 },
        { id: 2, text: "b", source: "Walden", length: 1 },
      ],
    };
    writeFileSync(
      path.join(dir, "quotes/english.json"),
      JSON.stringify(quotes),
    );

    expect(stripSteamAssets(dir)).toEqual({ sounds: 2, quotes: 1 });
    expect(existsSync(path.join(dir, "sounds/click1"))).toBe(false);
    expect(existsSync(path.join(dir, "sounds/timeWarning.wav"))).toBe(false);
    expect(existsSync(path.join(dir, "sounds/error2/1.wav"))).toBe(true);
    const out = JSON.parse(
      readFileSync(path.join(dir, "quotes/english.json"), "utf8"),
    );
    expect(out.groups).toEqual(quotes.groups);
    expect(out.quotes).toEqual([quotes.quotes[1]]);
  });
});
