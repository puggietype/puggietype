import { isKidsGuidePath } from "../controllers/background-music";
import {
  MUSIC_DUCK_FACTOR,
  MUSIC_TRACKS,
  type SteamSettings,
} from "./settings-store";

export type MusicAudio = {
  src: string;
  volume: number;
  paused: boolean;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: "ended", listener: () => void) => void;
};

type MusicDeps = {
  createAudio: () => MusicAudio;
  getPathname: () => string;
  random?: () => number;
};

/**
 * Steam background music. Off by default; nothing is fetched until it is
 * on and the user has clicked or pressed a key (files are lazy: preload
 * none). Shuffle plays the tracks in a random order, one after another.
 */
export class SteamMusic {
  private audio: MusicAudio | null = null;
  private current: string | null = null;
  private gesture = false;
  private typing = false;

  private settings: SteamSettings;
  private readonly deps: MusicDeps;

  constructor(settings: SteamSettings, deps: MusicDeps) {
    this.settings = settings;
    this.deps = deps;
  }

  update(settings: SteamSettings): void {
    this.settings = settings;
    this.sync();
  }

  noteGesture(): void {
    this.gesture = true;
    this.sync();
  }

  /** a test or race started or stopped */
  setTyping(active: boolean): void {
    if (active === this.typing) return;
    this.typing = active;
    this.sync();
  }

  /** effective 0..1 volume for the current state */
  volume(): number {
    const { music, masterVolume } = this.settings;
    const duck =
      this.typing && music.whileTyping === "lower" ? MUSIC_DUCK_FACTOR : 1;
    return music.volume * masterVolume * duck;
  }

  shouldPlay(): boolean {
    const { music } = this.settings;
    if (!music.enabled || !this.gesture) return false;
    if (isKidsGuidePath(this.deps.getPathname())) return false;
    return !(this.typing && music.whileTyping === "pause");
  }

  pickTrack(previous: string | null): string {
    const { track } = this.settings.music;
    if (track !== "shuffle") {
      return (
        MUSIC_TRACKS.find((t) => t.id === track)?.src ?? MUSIC_TRACKS[0].src
      );
    }
    const pool = MUSIC_TRACKS.filter((t) => t.src !== previous);
    const r = (this.deps.random ?? Math.random)();
    return (pool[Math.floor(r * pool.length)] ?? MUSIC_TRACKS[0]).src;
  }

  currentSrc(): string | null {
    return this.current;
  }

  private sync(): void {
    if (!this.shouldPlay()) {
      if (this.audio !== null && !this.audio.paused) this.audio.pause();
      return;
    }
    const wanted = this.settings.music.track;
    const fixed = MUSIC_TRACKS.find((t) => t.id === wanted)?.src;
    if (this.audio === null) {
      this.audio = this.deps.createAudio();
      this.audio.addEventListener("ended", () => this.next());
    }
    if (
      this.current === null ||
      (fixed !== undefined && this.current !== fixed)
    ) {
      this.current = this.pickTrack(this.current);
      this.audio.src = this.current;
    }
    this.audio.volume = this.volume();
    if (this.audio.paused) {
      void this.audio.play().catch(() => {
        // blocked or missing file: stay silent
      });
    }
  }

  private next(): void {
    if (this.audio === null) return;
    this.current = this.pickTrack(this.current);
    this.audio.src = this.current;
    this.sync();
  }
}
