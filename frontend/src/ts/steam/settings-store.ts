import { z } from "zod";

import type { PlatformStorage } from "../platform/types";

/**
 * Steam-only game settings (Graphics / Sound extras and background music).
 * Kept in the platform storage (the desktop shell's store), never synced.
 * The desktop main process reads the display fields of the same key at
 * startup (desktop/src/display.mjs), so keep the names in step.
 */
export const STEAM_SETTINGS_KEY = "steamGameSettings";

export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

export const DISPLAY_MODES = ["windowed", "borderless", "fullscreen"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

/** windowed sizes; "native" is the screen size */
export const RESOLUTIONS = [
  "native",
  "1280x720",
  "1366x768",
  "1600x900",
  "1920x1080",
  "2560x1440",
] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** 0 = unlimited */
export const FPS_CAPS = [30, 60, 120, 144, 0] as const;
export type FpsCap = (typeof FPS_CAPS)[number];

export const ANIMATION_QUALITIES = ["full", "reduced", "off"] as const;
export type AnimationQuality = (typeof ANIMATION_QUALITIES)[number];

export const BRIGHTNESS_MIN = 0.5;
export const BRIGHTNESS_MAX = 1.5;

export const MUSIC_TRACKS = [
  { id: "sherwood", title: "Sherwood", src: "/music/sherwood.ogg" },
  { id: "calm-theme", title: "calm theme", src: "/music/calm-theme.ogg" },
] as const;

export type MusicTrackId = (typeof MUSIC_TRACKS)[number]["id"];

const literal = <T extends string | number>(
  values: readonly T[],
): z.ZodType<T> =>
  z.custom<T>((v) => (values as readonly unknown[]).includes(v));

export const SteamSettingsSchema = z.object({
  // graphics
  displayMode: literal(DISPLAY_MODES),
  resolution: literal(RESOLUTIONS),
  vsync: z.boolean(),
  fpsCap: literal(FPS_CAPS),
  uiScale: z.number().min(0.5).max(2),
  animation: literal(ANIMATION_QUALITIES),
  brightness: z.number().min(BRIGHTNESS_MIN).max(BRIGHTNESS_MAX),
  // sound
  masterVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
  muted: z.boolean(),
  music: z.object({
    enabled: z.boolean(),
    volume: z.number().min(0).max(1),
    track: z.enum(["shuffle", "sherwood", "calm-theme"]),
    /** pause: stop during tests and races; lower: duck; keep: no change */
    whileTyping: z.enum(["pause", "lower", "keep"]),
  }),
});

export type SteamSettings = z.infer<typeof SteamSettingsSchema>;

export const DEFAULT_STEAM_SETTINGS: SteamSettings = {
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
};

/** settings that only take effect after the app restarts */
export const RESTART_SETTINGS = ["vsync"] as const;

/** music volume factor while a test or race runs and whileTyping is "lower" */
export const MUSIC_DUCK_FACTOR = 0.3;

export function defaultSteamSettings(): SteamSettings {
  return {
    ...DEFAULT_STEAM_SETTINGS,
    music: { ...DEFAULT_STEAM_SETTINGS.music },
  };
}

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Field by field: a bad or missing value falls back to its default, so an
 * older store (e.g. one with `reducedMotion`) keeps the rest of its choices.
 */
export function parseSteamSettings(value: unknown): SteamSettings {
  const out = defaultSteamSettings();
  if (!isObject(value)) return out;
  const shape = SteamSettingsSchema.shape;
  const top = out as unknown as Raw;
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    if (key === "music") continue;
    const r = shape[key].safeParse(value[key]);
    if (r.success) top[key] = r.data;
  }
  if (value["animation"] === undefined && value["reducedMotion"] === true) {
    out.animation = "reduced";
  }
  if (isObject(value["music"])) {
    const m = value["music"];
    const musicShape = shape.music.shape;
    const music = out.music as unknown as Raw;
    for (const key of Object.keys(musicShape) as (keyof typeof musicShape)[]) {
      const r = musicShape[key].safeParse(m[key]);
      if (r.success) music[key] = r.data;
    }
  }
  return out;
}

export function readSteamSettings(storage: PlatformStorage): SteamSettings {
  const raw = storage.getItem(STEAM_SETTINGS_KEY);
  if (raw === null || raw === "") return defaultSteamSettings();
  try {
    return parseSteamSettings(JSON.parse(raw));
  } catch {
    return defaultSteamSettings();
  }
}

export function writeSteamSettings(
  storage: PlatformStorage,
  settings: SteamSettings,
): void {
  storage.setItem(STEAM_SETTINGS_KEY, JSON.stringify(settings));
}

export function parseResolution(
  r: Resolution,
): { width: number; height: number } | null {
  if (r === "native") return null;
  const [w, h] = r.split("x").map(Number);
  return { width: w ?? 0, height: h ?? 0 };
}
