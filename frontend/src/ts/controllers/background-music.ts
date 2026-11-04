import { z } from "zod";

export const BG_MUSIC_STORAGE_KEY = "bgMusic";

/**
 * Background music tracks for the web build: the same two CC0 tracks as the
 * steam build (static/music/SOURCES.md), played one after another. Lazy:
 * nothing is fetched until music is on and the user has clicked or pressed
 * a key (preload "none"). The steam build has its own player
 * (src/ts/steam/music.ts), so this one has no tracks there.
 */
export const BG_MUSIC_TRACKS: readonly string[] =
  typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam"
    ? []
    : ["/music/sherwood.ogg", "/music/calm-theme.ogg"];

/** first track, or `null` when there is none (player hidden and silent) */
export const BG_MUSIC_SRC: string | null = BG_MUSIC_TRACKS[0] ?? null;

export const KIDS_GUIDE_PATH = "/guide/typing-for-kids";

export const DEFAULT_BG_MUSIC_VOLUME = 0.5;

export const BgMusicSettingsSchema = z.object({
  enabled: z.boolean(),
  volume: z.number().min(0).max(1),
});

export type BgMusicSettings = z.infer<typeof BgMusicSettingsSchema>;

export const DEFAULT_BG_MUSIC: BgMusicSettings = {
  enabled: false,
  volume: DEFAULT_BG_MUSIC_VOLUME,
};

export type BgMusicAudio = {
  src: string;
  loop: boolean;
  volume: number;
  paused: boolean;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener?: (type: "ended", listener: () => void) => void;
};

export type BgMusicStore = {
  get: () => BgMusicSettings;
  set: (settings: BgMusicSettings) => void;
  remove: () => void;
};

export type GestureTarget = {
  addEventListener: (
    type: "pointerdown" | "keydown",
    listener: () => void,
    capture: true,
  ) => void;
  removeEventListener: (
    type: "pointerdown" | "keydown",
    listener: () => void,
    capture: true,
  ) => void;
};

export function isKidsGuidePath(pathname: string): boolean {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return trimmed === KIDS_GUIDE_PATH;
}

export function clampBgMusicVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BG_MUSIC_VOLUME;
  return Math.min(1, Math.max(0, value));
}

export function sanitizeBgMusicSettings(
  value: BgMusicSettings,
): BgMusicSettings {
  return {
    enabled: value.enabled,
    volume: clampBgMusicVolume(value.volume),
  };
}

export function readBgMusicSettings(raw: string | null): BgMusicSettings {
  if (raw === null || raw === "") return { ...DEFAULT_BG_MUSIC };
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = BgMusicSettingsSchema.safeParse(parsed);
    if (!result.success) return { ...DEFAULT_BG_MUSIC };
    return sanitizeBgMusicSettings(result.data);
  } catch {
    return { ...DEFAULT_BG_MUSIC };
  }
}

export type BackgroundMusicHold = {
  testActive: boolean;
  raceActive: boolean;
  documentHidden: boolean;
};

/** Pause during a test, a race, or while this tab is hidden. */
export function shouldSuspendBackgroundMusic(
  hold: BackgroundMusicHold,
): boolean {
  return hold.testActive || hold.raceActive || hold.documentHidden;
}

export function canPlayBackgroundMusic(input: {
  pathname: string;
  enabled: boolean;
  hasUserGesture: boolean;
  src: string | null;
  suspended?: boolean;
}): boolean {
  if (isKidsGuidePath(input.pathname)) return false;
  if (!input.enabled) return false;
  if (!input.hasUserGesture) return false;
  if (input.suspended === true) return false;
  if (input.src === null || input.src === "") return false;
  return true;
}

type BackgroundMusicOptions = {
  store: BgMusicStore;
  getPathname: () => string;
  createAudio: (src: string) => BgMusicAudio;
  src: string | null;
  /** play these in order (wrapping); `src` is the first. One track loops. */
  tracks?: readonly string[];
};

/**
 * Local background-music player. Off until enabled, and `play()` is never
 * called before a pointer or key gesture in this document. Nothing is reported.
 */
export class BackgroundMusic {
  private settings: BgMusicSettings;
  private hasGesture = false;
  private suspended = false;
  private audio: BgMusicAudio | null = null;
  private trackIndex = 0;
  private readonly options: BackgroundMusicOptions;

  constructor(options: BackgroundMusicOptions) {
    this.options = options;
    this.settings = sanitizeBgMusicSettings(options.store.get());
  }

  getSettings(): BgMusicSettings {
    return { ...this.settings };
  }

  /**
   * Listen for the first pointer or key in this document. On the kids guide
   * this adds nothing, so the page never arms music or a prompt.
   */
  install(target: GestureTarget): () => void {
    if (isKidsGuidePath(this.options.getPathname())) {
      return (): void => {
        // The kids guide never subscribed, so there is nothing to remove.
      };
    }
    const onGesture = (): void => {
      target.removeEventListener("pointerdown", onGesture, true);
      target.removeEventListener("keydown", onGesture, true);
      this.noteUserGesture();
    };
    target.addEventListener("pointerdown", onGesture, true);
    target.addEventListener("keydown", onGesture, true);
    return () => {
      target.removeEventListener("pointerdown", onGesture, true);
      target.removeEventListener("keydown", onGesture, true);
    };
  }

  noteUserGesture(): void {
    if (isKidsGuidePath(this.options.getPathname())) return;
    this.hasGesture = true;
    this.sync();
  }

  setEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, enabled };
    this.persist();
    if (enabled && !isKidsGuidePath(this.options.getPathname())) {
      this.hasGesture = true;
    }
    this.sync();
  }

  setVolume(volume: number): void {
    this.settings = {
      ...this.settings,
      volume: clampBgMusicVolume(volume),
    };
    this.persist();
    if (this.audio !== null) this.audio.volume = this.settings.volume;
  }

  /**
   * Pause while a test or race is running, or while the tab is hidden.
   * Clearing the hold resumes playback only when music is still enabled.
   */
  setPlaybackSuspended(hold: BackgroundMusicHold): void {
    const next = shouldSuspendBackgroundMusic(hold);
    if (next === this.suspended) return;
    this.suspended = next;
    this.sync();
  }

  /** Another tab wrote the preference. Does not count as a gesture. */
  replace(next: BgMusicSettings): void {
    this.settings = sanitizeBgMusicSettings(next);
    this.persist();
    this.sync();
  }

  reset(): void {
    this.settings = { ...DEFAULT_BG_MUSIC };
    this.options.store.remove();
    this.sync();
  }

  /** current track (for tests and the smoke check) */
  currentTrack(): string | null {
    const tracks = this.options.tracks ?? [];
    return tracks[this.trackIndex] ?? this.options.src;
  }

  private nextTrack(): void {
    const tracks = this.options.tracks ?? [];
    if (this.audio === null || tracks.length <= 1) return;
    this.trackIndex = (this.trackIndex + 1) % tracks.length;
    this.audio.src = tracks[this.trackIndex] ?? tracks[0] ?? "";
    this.sync();
  }

  private persist(): void {
    this.options.store.set(this.settings);
  }

  private sync(): void {
    const allowed = canPlayBackgroundMusic({
      pathname: this.options.getPathname(),
      enabled: this.settings.enabled,
      hasUserGesture: this.hasGesture,
      src: this.options.src,
      suspended: this.suspended,
    });
    if (!allowed) {
      if (this.audio !== null && !this.audio.paused) this.audio.pause();
      return;
    }
    const src = this.options.src;
    if (src === null || src === "") return;
    if (this.audio === null) {
      try {
        this.audio = this.options.createAudio(src);
      } catch (error) {
        console.error("Background music failed to start", error);
        return;
      }
      const tracks = this.options.tracks ?? [src];
      this.audio.loop = tracks.length <= 1;
      if (tracks.length > 1) {
        this.audio.addEventListener?.("ended", () => this.nextTrack());
      }
    }
    this.audio.volume = this.settings.volume;
    if (!this.audio.paused) return;
    // The browser blocked playback (autoplay rules) or the file is missing:
    // stay silent, with nothing in the console. Some engines return no
    // promise or throw synchronously.
    try {
      void Promise.resolve(this.audio.play()).catch(() => undefined);
    } catch {
      // as above
    }
  }
}
