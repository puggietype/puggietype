import { z } from "zod";

import type { PlatformStorage } from "../platform/types";

/**
 * Steam-only game settings (Graphics / Sound extras and background music).
 * Kept in the platform storage (the desktop shell's store), never synced.
 */
export const STEAM_SETTINGS_KEY = "steamGameSettings";

export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

export const MUSIC_TRACKS = [
  { id: "sherwood", title: "Sherwood", src: "/music/sherwood.ogg" },
  { id: "calm-theme", title: "calm theme", src: "/music/calm-theme.ogg" },
] as const;

export type MusicTrackId = (typeof MUSIC_TRACKS)[number]["id"];

export const SteamSettingsSchema = z.object({
  uiScale: z.number().min(0.5).max(2),
  reducedMotion: z.boolean(),
  masterVolume: z.number().min(0).max(1),
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
  uiScale: 1,
  reducedMotion: false,
  masterVolume: 1,
  music: {
    enabled: false,
    volume: 0.5,
    track: "shuffle",
    whileTyping: "pause",
  },
};

/** music volume factor while a test or race runs and whileTyping is "lower" */
export const MUSIC_DUCK_FACTOR = 0.3;

function clone(s: SteamSettings): SteamSettings {
  return { ...s, music: { ...s.music } };
}

export function readSteamSettings(storage: PlatformStorage): SteamSettings {
  const raw = storage.getItem(STEAM_SETTINGS_KEY);
  if (raw === null || raw === "") return clone(DEFAULT_STEAM_SETTINGS);
  try {
    const parsed = SteamSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : clone(DEFAULT_STEAM_SETTINGS);
  } catch {
    return clone(DEFAULT_STEAM_SETTINGS);
  }
}

export function writeSteamSettings(
  storage: PlatformStorage,
  settings: SteamSettings,
): void {
  storage.setItem(STEAM_SETTINGS_KEY, JSON.stringify(settings));
}
