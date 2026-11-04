import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { SteamMusic, type MusicAudio } from "../../src/ts/steam/music";
import {
  DEFAULT_STEAM_SETTINGS,
  MUSIC_DUCK_FACTOR,
  MUSIC_TRACKS,
  readSteamSettings,
  STEAM_SETTINGS_KEY,
  type SteamSettings,
  writeSteamSettings,
} from "../../src/ts/steam/settings-store";
import type { PlatformStorage } from "../../src/ts/platform/types";

function memStorage(): PlatformStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function fakeAudio(): MusicAudio & { plays: number; ended?: () => void } {
  const a = {
    src: "",
    volume: 1,
    paused: true,
    plays: 0,
    ended: undefined as (() => void) | undefined,
    play: vi.fn(async () => {
      a.paused = false;
      a.plays++;
    }),
    pause: vi.fn(() => {
      a.paused = true;
    }),
    addEventListener: (_: "ended", l: () => void) => {
      a.ended = l;
    },
  };
  return a;
}

const withMusic = (m: Partial<SteamSettings["music"]>): SteamSettings => ({
  ...DEFAULT_STEAM_SETTINGS,
  music: { ...DEFAULT_STEAM_SETTINGS.music, ...m },
});

function player(
  s: SteamSettings,
  random = (): number => 0,
): {
  music: SteamMusic;
  audio: ReturnType<typeof fakeAudio>;
  createAudio: () => MusicAudio;
} {
  const audio = fakeAudio();
  const createAudio = vi.fn(() => audio);
  const music = new SteamMusic(s, {
    createAudio,
    getPathname: () => "/",
    random,
  });
  return { music, audio, createAudio };
}

describe("steam game settings: defaults and persistence", () => {
  it("music is on by default at 35%; other defaults", () => {
    expect(DEFAULT_STEAM_SETTINGS).toEqual({
      displayMode: "windowed",
      resolution: "native",
      vsync: true,
      fpsCap: 60,
      uiScale: 1,
      animation: "full",
      brightness: 1,
      masterVolume: 1,
      sfxVolume: 1,
      muted: false,
      music: {
        enabled: true,
        volume: 0.35,
        track: "shuffle",
        whileTyping: "pause",
      },
    });
    const fresh = readSteamSettings(memStorage());
    expect(fresh.music.enabled).toBe(true);
    expect(fresh.music.volume).toBe(0.35);
  });

  it("keeps valid fields of an older or partly bad store", () => {
    const s = memStorage();
    s.setItem(
      STEAM_SETTINGS_KEY,
      JSON.stringify({
        uiScale: 1.25,
        reducedMotion: true,
        masterVolume: 7,
        music: { enabled: false, volume: 0.2, track: "nope" },
      }),
    );
    const r = readSteamSettings(s);
    expect(r.uiScale).toBe(1.25);
    expect(r.animation).toBe("reduced");
    expect(r.masterVolume).toBe(1);
    expect(r.music).toEqual({
      enabled: false,
      volume: 0.2,
      track: "shuffle",
      whileTyping: "pause",
    });
    expect(r.fpsCap).toBe(60);
  });

  it("rejects values outside each setting's options", () => {
    const s = memStorage();
    s.setItem(
      STEAM_SETTINGS_KEY,
      JSON.stringify({
        displayMode: "tiny",
        resolution: "123x45",
        vsync: "yes",
        fpsCap: 75,
        brightness: 3,
        sfxVolume: -1,
        muted: 1,
        animation: "max",
      }),
    );
    const r = readSteamSettings(s);
    const d = DEFAULT_STEAM_SETTINGS;
    expect(r.displayMode).toBe(d.displayMode);
    expect(r.resolution).toBe(d.resolution);
    expect(r.vsync).toBe(d.vsync);
    expect(r.fpsCap).toBe(d.fpsCap);
    expect(r.brightness).toBe(d.brightness);
    expect(r.sfxVolume).toBe(d.sfxVolume);
    expect(r.muted).toBe(d.muted);
    expect(r.animation).toBe(d.animation);
  });

  it("round-trips through the platform storage", () => {
    const s = memStorage();
    const next = {
      ...withMusic({ enabled: true, track: "sherwood" as const }),
      uiScale: 1.25,
    };
    writeSteamSettings(s, next);
    expect(JSON.parse(s.map.get(STEAM_SETTINGS_KEY) ?? "")).toEqual(next);
    expect(readSteamSettings(s)).toEqual(next);
  });

  it("falls back to defaults on bad data", () => {
    const s = memStorage();
    s.setItem(STEAM_SETTINGS_KEY, "{nope");
    expect(readSteamSettings(s)).toEqual(DEFAULT_STEAM_SETTINGS);
    s.setItem(STEAM_SETTINGS_KEY, JSON.stringify({ uiScale: 9 }));
    expect(readSteamSettings(s)).toEqual(DEFAULT_STEAM_SETTINGS);
  });
});

describe("SteamMusic", () => {
  it("turned off: never creates audio or fetches, even after a gesture", () => {
    const { music, createAudio } = player(withMusic({ enabled: false }));
    music.noteGesture();
    expect(createAudio).not.toHaveBeenCalled();
  });

  it("on by default, but fetches nothing before a gesture (autoplay rules)", () => {
    const { music, audio, createAudio } = player(DEFAULT_STEAM_SETTINGS);
    music.update(DEFAULT_STEAM_SETTINGS);
    expect(createAudio).not.toHaveBeenCalled();
    music.noteGesture();
    expect(audio.plays).toBe(1);
    expect(audio.volume).toBeCloseTo(0.35);
  });

  it("mute silences the music without forgetting its volume", () => {
    const s = { ...withMusic({ enabled: true, volume: 0.5 }), muted: true };
    const { music, audio } = player(s);
    music.noteGesture();
    expect(audio.volume).toBe(0);
    music.update({ ...s, muted: false });
    expect(audio.volume).toBeCloseTo(0.5);
  });

  it("waits for a gesture, then plays the chosen track at its volume", () => {
    const { music, audio, createAudio } = player(
      withMusic({ enabled: true, track: "calm-theme", volume: 0.4 }),
    );
    music.update(
      withMusic({ enabled: true, track: "calm-theme", volume: 0.4 }),
    );
    expect(createAudio).not.toHaveBeenCalled();
    music.noteGesture();
    expect(audio.src).toBe("/music/calm-theme.ogg");
    expect(audio.volume).toBeCloseTo(0.4);
    expect(audio.plays).toBe(1);
  });

  it("master volume scales the music", () => {
    const s = {
      ...withMusic({ enabled: true, volume: 0.5 }),
      masterVolume: 0.5,
    };
    const { music, audio } = player(s);
    music.noteGesture();
    expect(audio.volume).toBeCloseTo(0.25);
  });

  it("pauses during tests and races by default", () => {
    const { music, audio } = player(withMusic({ enabled: true }));
    music.noteGesture();
    music.setTyping(true);
    expect(audio.paused).toBe(true);
    music.setTyping(false);
    expect(audio.paused).toBe(false);
  });

  it("lower ducks under typing sounds; keep leaves it", () => {
    const low = player(
      withMusic({ enabled: true, whileTyping: "lower", volume: 1 }),
    );
    low.music.noteGesture();
    low.music.setTyping(true);
    expect(low.audio.paused).toBe(false);
    expect(low.audio.volume).toBeCloseTo(MUSIC_DUCK_FACTOR);
    const keep = player(
      withMusic({ enabled: true, whileTyping: "keep", volume: 1 }),
    );
    keep.music.noteGesture();
    keep.music.setTyping(true);
    expect(keep.audio.volume).toBeCloseTo(1);
  });

  it("shuffle moves to a different track when one ends", () => {
    const { music, audio } = player(withMusic({ enabled: true }));
    music.noteGesture();
    const first = audio.src;
    audio.paused = true;
    audio.ended?.();
    expect(audio.src).not.toBe(first);
    expect(MUSIC_TRACKS.map((t) => t.src)).toContain(audio.src);
  });

  it("never plays on the kids guide", () => {
    const audio = fakeAudio();
    const music = new SteamMusic(withMusic({ enabled: true }), {
      createAudio: () => audio,
      getPathname: () => "/guide/typing-for-kids",
    });
    music.noteGesture();
    expect(audio.plays).toBe(0);
  });
});

describe("static/music SOURCES.md (Legal)", () => {
  const dir = path.resolve(__dirname, "../../static/music");
  const sources = readFileSync(path.join(dir, "SOURCES.md"), "utf8");
  const rows = sources
    .split("\n")
    .filter((l) => /^\| [^ ]+\.(ogg|mp3|wav|flac|opus) \|/.test(l))
    .map((l) =>
      l
        .split("|")
        .map((c) => c.trim())
        .slice(1, -1),
    );

  it("lists every audio file with a matching sha256, CC0 1.0 and its source pages", () => {
    const files = readdirSync(dir).filter((f) => f !== "SOURCES.md");
    expect(files.length).toBeGreaterThan(0);
    expect(rows.map((r) => r[0]).sort()).toEqual([...files].sort());
    for (const r of rows) {
      const [
        file,
        title,
        author,
        source,
        fileUrl,
        licence,
        licencePage,
        date,
        sha,
      ] = r;
      const actual = createHash("sha256")
        .update(readFileSync(path.join(dir, file ?? "")))
        .digest("hex");
      expect(sha, file).toBe(actual);
      expect(licence).toBe("CC0 1.0");
      expect(licencePage).toBe(
        "https://creativecommons.org/publicdomain/zero/1.0/",
      );
      expect(source).toMatch(/^https:\/\/opengameart\.org\/content\//);
      expect(fileUrl).toMatch(/^https:\/\//);
      expect(title).not.toBe("");
      expect(author).not.toBe("");
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every track in the player is a listed file; total stays small", () => {
    for (const t of MUSIC_TRACKS) {
      expect(rows.map((r) => `/music/${r[0]}`)).toContain(t.src);
    }
    const total = readdirSync(dir).reduce(
      (n, f) => n + readFileSync(path.join(dir, f)).length,
      0,
    );
    expect(total).toBeLessThan(4 * 1024 * 1024);
  });
});
