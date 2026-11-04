import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BackgroundMusic,
  BG_MUSIC_SRC,
  BG_MUSIC_STORAGE_KEY,
  BG_MUSIC_TRACKS,
  type BgMusicAudio,
  type BgMusicSettings,
  type BgMusicStore,
  type GestureTarget,
  canPlayBackgroundMusic,
  clampBgMusicVolume,
  DEFAULT_BG_MUSIC,
  isKidsGuidePath,
  KIDS_GUIDE_PATH,
  readBgMusicSettings,
  shouldSuspendBackgroundMusic,
} from "../../src/ts/controllers/background-music";
import {
  backgroundMusic,
  bindBackgroundMusicHold,
  getBgMusicEnabled,
  getBgMusicVolume,
  installBackgroundMusic,
  resetBackgroundMusic,
  setBgMusicEnabled,
  setBgMusicVolume,
  uninstallBackgroundMusic,
} from "../../src/ts/states/background-music";

function memoryStore(initial?: BgMusicSettings): BgMusicStore & {
  saved: BgMusicSettings | null;
} {
  let saved = initial === undefined ? null : { ...initial };
  return {
    get saved(): BgMusicSettings | null {
      return saved === null ? null : { ...saved };
    },
    get: (): BgMusicSettings =>
      saved === null ? { ...DEFAULT_BG_MUSIC } : { ...saved },
    set: (settings: BgMusicSettings): void => {
      saved = { ...settings };
    },
    remove: (): void => {
      saved = null;
    },
  };
}

function fakeTarget(): GestureTarget & {
  fire: (type: "pointerdown" | "keydown") => void;
  listenerCount: (type: "pointerdown" | "keydown") => number;
} {
  const map = new Map<"pointerdown" | "keydown", Set<() => void>>();
  return {
    addEventListener: (type, listener) => {
      const set = map.get(type) ?? new Set<() => void>();
      set.add(listener);
      map.set(type, set);
    },
    removeEventListener: (type, listener) => {
      map.get(type)?.delete(listener);
    },
    fire: (type) => {
      for (const listener of [...(map.get(type) ?? [])]) listener();
    },
    listenerCount: (type) => map.get(type)?.size ?? 0,
  };
}

function fakeAudio(): BgMusicAudio & {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
} {
  let paused = true;
  const audio = {
    src: "",
    loop: false,
    volume: 1,
    get paused() {
      return paused;
    },
    play: vi.fn(async () => {
      paused = false;
    }),
    pause: vi.fn(() => {
      paused = true;
    }),
  };
  return audio;
}

describe("background music preferences", () => {
  it("defaults to off at half volume", () => {
    expect(DEFAULT_BG_MUSIC).toEqual({ enabled: false, volume: 0.5 });
    expect(readBgMusicSettings(null)).toEqual(DEFAULT_BG_MUSIC);
    expect(readBgMusicSettings("")).toEqual(DEFAULT_BG_MUSIC);
    expect(readBgMusicSettings("not-json")).toEqual(DEFAULT_BG_MUSIC);
    expect(readBgMusicSettings('{"enabled":"yes","volume":2}')).toEqual(
      DEFAULT_BG_MUSIC,
    );
  });

  it("clamps volume and keeps a valid saved preference", () => {
    expect(clampBgMusicVolume(Number.NaN)).toBe(0.5);
    expect(clampBgMusicVolume(-1)).toBe(0);
    expect(clampBgMusicVolume(2)).toBe(1);
    expect(clampBgMusicVolume(0.25)).toBe(0.25);
    expect(readBgMusicSettings('{"enabled":true,"volume":0.4}')).toEqual({
      enabled: true,
      volume: 0.4,
    });
  });

  it("web plays the two CC0 tracks from static/music, listed in SOURCES.md", () => {
    expect(BG_MUSIC_TRACKS).toEqual([
      "/music/sherwood.ogg",
      "/music/calm-theme.ogg",
    ]);
    expect(BG_MUSIC_SRC).toBe("/music/sherwood.ogg");
    const sources = readFileSync(
      path.resolve(__dirname, "../../static/music/SOURCES.md"),
      "utf8",
    );
    for (const t of BG_MUSIC_TRACKS) {
      const file = t.replace("/music/", "");
      expect(
        existsSync(path.resolve(__dirname, "../../static/music", file)),
      ).toBe(true);
      expect(sources).toMatch(
        new RegExp(`\\| ${file} \\|[^\\n]*\\| CC0 1\\.0 \\|`),
      );
    }
  });

  it("off by default on web", () => {
    expect(DEFAULT_BG_MUSIC.enabled).toBe(false);
    expect(readBgMusicSettings(null).enabled).toBe(false);
  });

  it("plays the tracks one after another, and fetches nothing until on and a gesture", () => {
    let stored = { ...DEFAULT_BG_MUSIC };
    const audios: {
      src: string;
      loop: boolean;
      volume: number;
      paused: boolean;
      plays: number;
      ended?: () => void;
      play: () => Promise<void>;
      pause: () => void;
      addEventListener: (t: "ended", l: () => void) => void;
    }[] = [];
    const createAudio = vi.fn((src: string) => {
      const a = {
        src,
        loop: true,
        volume: 1,
        paused: true,
        plays: 0,
        ended: undefined as (() => void) | undefined,
        play: async function (this: { paused: boolean; plays: number }) {
          this.paused = false;
          this.plays++;
        },
        pause: function (this: { paused: boolean }) {
          this.paused = true;
        },
        addEventListener: function (
          this: { ended?: () => void },
          _t: "ended",
          l: () => void,
        ) {
          this.ended = l;
        },
      };
      audios.push(a);
      return a;
    });
    const player = new BackgroundMusic({
      store: {
        get: () => stored,
        set: (v) => (stored = v),
        remove: () => undefined,
      },
      getPathname: () => "/",
      createAudio,
      src: BG_MUSIC_TRACKS[0] ?? null,
      tracks: BG_MUSIC_TRACKS,
    });
    player.noteUserGesture();
    expect(createAudio).not.toHaveBeenCalled();
    player.setEnabled(true);
    expect(stored.enabled).toBe(true);
    const a = audios[0];
    if (a === undefined) throw new Error("no audio");
    expect(a.src).toBe("/music/sherwood.ogg");
    expect(a.loop).toBe(false);
    a.paused = true;
    a.ended?.();
    expect(a.src).toBe("/music/calm-theme.ogg");
    expect(a.paused).toBe(false);
    a.paused = true;
    a.ended?.();
    expect(a.src).toBe("/music/sherwood.ogg");
    expect(createAudio).toHaveBeenCalledTimes(1);
  });
});

describe("kids guide", () => {
  it("matches only the kids guide path", () => {
    expect(isKidsGuidePath(KIDS_GUIDE_PATH)).toBe(true);
    expect(isKidsGuidePath("/guide/typing-for-kids/")).toBe(true);
    expect(isKidsGuidePath("/guide/typing-for-kids/extra")).toBe(false);
    expect(isKidsGuidePath("/guide/typing-tips")).toBe(false);
    expect(isKidsGuidePath("/")).toBe(false);
  });

  it("has no music, prompt, or analytics on the kids page", () => {
    const files = [
      "src/guide/typing-for-kids.html",
      "src/html/static-page/header.html",
      "src/html/static-page/footer.html",
    ];
    for (const file of files) {
      const html = readFileSync(
        path.resolve(__dirname, "../../", file),
        "utf8",
      );
      expect(html.toLowerCase(), file).not.toContain("background music");
      expect(html, file).not.toContain("<audio");
      expect(html, file).not.toContain("bg-music");
      expect(html, file).not.toContain("bgMusic");
      expect(html, file).not.toMatch(/gtag\(|google-analytics|plausible|umami/);
    }
  });
});

describe("canPlayBackgroundMusic", () => {
  const ready = {
    pathname: "/settings",
    enabled: true,
    hasUserGesture: true,
    src: "/sounds/bg-music.ogg",
  };

  it("requires a gesture, an enabled switch, and a track", () => {
    expect(canPlayBackgroundMusic(ready)).toBe(true);
    expect(canPlayBackgroundMusic({ ...ready, enabled: false })).toBe(false);
    expect(canPlayBackgroundMusic({ ...ready, hasUserGesture: false })).toBe(
      false,
    );
    expect(canPlayBackgroundMusic({ ...ready, src: null })).toBe(false);
    expect(canPlayBackgroundMusic({ ...ready, src: "" })).toBe(false);
  });

  it("never plays on the kids guide", () => {
    expect(
      canPlayBackgroundMusic({ ...ready, pathname: "/guide/typing-for-kids" }),
    ).toBe(false);
    expect(
      canPlayBackgroundMusic({
        ...ready,
        pathname: "/guide/typing-for-kids/",
      }),
    ).toBe(false);
    expect(canPlayBackgroundMusic({ ...ready, suspended: true })).toBe(false);
  });
});

describe("BackgroundMusic", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function player(options: {
    pathname?: string;
    src?: string | null;
    initial?: BgMusicSettings;
    audio?: BgMusicAudio;
  }): {
    music: BackgroundMusic;
    store: ReturnType<typeof memoryStore>;
    audio: ReturnType<typeof fakeAudio>;
    target: ReturnType<typeof fakeTarget>;
    created: () => number;
    setPath: (pathname: string) => void;
  } {
    const store = memoryStore(options.initial);
    const audio =
      (options.audio as ReturnType<typeof fakeAudio> | undefined) ??
      fakeAudio();
    let created = 0;
    let path = options.pathname ?? "/";
    const music = new BackgroundMusic({
      store,
      getPathname: () => path,
      createAudio: () => {
        created += 1;
        return audio;
      },
      src: options.src === undefined ? "/sounds/bg-music.ogg" : options.src,
    });
    const target = fakeTarget();
    return {
      music,
      store,
      audio,
      target,
      created: (): number => created,
      setPath: (pathname: string): void => {
        path = pathname;
      },
    };
  }

  it("does not play on install, even when the saved switch is on", () => {
    const { music, audio, target, created } = player({
      initial: { enabled: true, volume: 0.4 },
    });
    music.install(target);
    expect(created()).toBe(0);
    expect(audio.play).not.toHaveBeenCalled();
    expect(target.listenerCount("pointerdown")).toBe(1);
    expect(target.listenerCount("keydown")).toBe(1);
  });

  it("plays after a key or pointer gesture and then drops the listeners", () => {
    const { music, audio, target } = player({
      initial: { enabled: true, volume: 0.4 },
    });
    music.install(target);
    target.fire("keydown");
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.loop).toBe(true);
    expect(audio.volume).toBe(0.4);
    expect(target.listenerCount("keydown")).toBe(0);
    target.fire("pointerdown");
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("stays silent while off, then starts when turned on", () => {
    const { music, audio, target, store, created } = player({});
    music.install(target);
    target.fire("pointerdown");
    expect(created()).toBe(0);
    music.setEnabled(true);
    expect(store.saved).toEqual({ enabled: true, volume: 0.5 });
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("does not create audio when no track is configured", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { music, created } = player({ src: null });
    music.setEnabled(true);
    music.noteUserGesture();
    expect(created()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("persists volume without starting playback", () => {
    const { music, audio, store } = player({
      initial: { enabled: true, volume: 0.5 },
    });
    music.setVolume(1.4);
    expect(store.saved).toEqual({ enabled: true, volume: 1 });
    expect(audio.play).not.toHaveBeenCalled();
    music.noteUserGesture();
    expect(audio.volume).toBe(1);
    music.setVolume(0.2);
    expect(audio.volume).toBe(0.2);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("pauses when turned off and resets to the default", () => {
    const { music, audio, store } = player({
      initial: { enabled: true, volume: 0.7 },
    });
    music.noteUserGesture();
    music.setEnabled(false);
    expect(audio.pause).toHaveBeenCalled();
    music.reset();
    expect(music.getSettings()).toEqual(DEFAULT_BG_MUSIC);
    expect(store.saved).toBeNull();
  });

  it("swallows a rejected play() and does not prompt", async () => {
    const rejected = fakeAudio();
    rejected.play.mockImplementation(async () => {
      throw new Error("blocked");
    });
    const { music } = player({
      initial: { enabled: true, volume: 0.5 },
      audio: rejected,
    });
    music.noteUserGesture();
    await Promise.resolve();
    expect(rejected.play).toHaveBeenCalledTimes(1);
  });

  it("never arms or plays on the kids guide", () => {
    const { music, audio, target, created } = player({
      pathname: "/guide/typing-for-kids/",
      initial: { enabled: true, volume: 0.8 },
    });
    const stop = music.install(target);
    expect(target.listenerCount("keydown")).toBe(0);
    expect(target.listenerCount("pointerdown")).toBe(0);
    target.fire("keydown");
    music.noteUserGesture();
    music.setEnabled(true);
    expect(created()).toBe(0);
    expect(audio.play).not.toHaveBeenCalled();
    stop();
  });

  it("stops if the path becomes the kids guide before the gesture", () => {
    const session = player({
      initial: { enabled: true, volume: 0.5 },
    });
    session.music.install(session.target);
    session.setPath(KIDS_GUIDE_PATH);
    session.target.fire("keydown");
    expect(session.audio.play).not.toHaveBeenCalled();
  });

  it("stores under the local key", () => {
    expect(BG_MUSIC_STORAGE_KEY).toBe("bgMusic");
  });

  const playing = {
    testActive: false,
    raceActive: false,
    documentHidden: false,
  };

  it("pauses for a test, a race, or a hidden tab, then resumes", () => {
    const { music, audio } = player({
      initial: { enabled: true, volume: 0.4 },
    });
    music.noteUserGesture();
    expect(audio.play).toHaveBeenCalledTimes(1);

    music.setPlaybackSuspended({ ...playing, testActive: true });
    expect(audio.pause).toHaveBeenCalledTimes(1);
    music.setPlaybackSuspended({ ...playing, raceActive: true });
    music.setPlaybackSuspended({ ...playing, documentHidden: true });
    expect(audio.play).toHaveBeenCalledTimes(1);

    music.setPlaybackSuspended(playing);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it("stays quiet through a hold that begins before playback", () => {
    const { music, audio, created } = player({
      initial: { enabled: true, volume: 0.5 },
    });
    music.setPlaybackSuspended({ ...playing, testActive: true });
    music.noteUserGesture();
    expect(created()).toBe(0);
    music.setPlaybackSuspended(playing);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("does not resume a hold when music is off", () => {
    const { music, audio } = player({
      initial: { enabled: true, volume: 0.5 },
    });
    music.noteUserGesture();
    music.setPlaybackSuspended({ ...playing, raceActive: true });
    music.setEnabled(false);
    music.setPlaybackSuspended(playing);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(music.getSettings().enabled).toBe(false);
  });
});

describe("shouldSuspendBackgroundMusic", () => {
  it("is true for a test, a race, or a hidden document", () => {
    expect(
      shouldSuspendBackgroundMusic({
        testActive: false,
        raceActive: false,
        documentHidden: false,
      }),
    ).toBe(false);
    expect(
      shouldSuspendBackgroundMusic({
        testActive: true,
        raceActive: false,
        documentHidden: false,
      }),
    ).toBe(true);
    expect(
      shouldSuspendBackgroundMusic({
        testActive: false,
        raceActive: true,
        documentHidden: false,
      }),
    ).toBe(true);
    expect(
      shouldSuspendBackgroundMusic({
        testActive: false,
        raceActive: false,
        documentHidden: true,
      }),
    ).toBe(true);
  });
});

describe("bindBackgroundMusicHold", () => {
  afterEach(() => {
    uninstallBackgroundMusic();
    backgroundMusic.setPlaybackSuspended({
      testActive: false,
      raceActive: false,
      documentHidden: false,
    });
    window.history.pushState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("tracks the test, the race, and visibilitychange", () => {
    const [testActive, setTestActive] = createSignal(false);
    const [raceActive, setRaceActive] = createSignal(false);
    let hidden = false;
    let onVisibility: (() => void) | undefined;
    const spy = vi.spyOn(backgroundMusic, "setPlaybackSuspended");
    bindBackgroundMusicHold({
      isTestActive: testActive,
      isRaceActive: raceActive,
      isDocumentHidden: () => hidden,
      subscribeVisibility: (listener) => {
        onVisibility = listener;
        return () => {
          onVisibility = undefined;
        };
      },
    });
    expect(spy).toHaveBeenLastCalledWith({
      testActive: false,
      raceActive: false,
      documentHidden: false,
    });
    setTestActive(true);
    expect(spy).toHaveBeenLastCalledWith({
      testActive: true,
      raceActive: false,
      documentHidden: false,
    });
    setTestActive(false);
    setRaceActive(true);
    expect(spy).toHaveBeenLastCalledWith({
      testActive: false,
      raceActive: true,
      documentHidden: false,
    });
    hidden = true;
    onVisibility?.();
    expect(spy).toHaveBeenLastCalledWith({
      testActive: false,
      raceActive: true,
      documentHidden: true,
    });
    setRaceActive(false);
    hidden = false;
    onVisibility?.();
    expect(spy).toHaveBeenLastCalledWith({
      testActive: false,
      raceActive: false,
      documentHidden: false,
    });
  });

  it("does not subscribe on the kids guide", () => {
    window.history.pushState({}, "", "/guide/typing-for-kids");
    const subscribe = vi.fn(() => () => undefined);
    bindBackgroundMusicHold({
      isTestActive: () => false,
      isRaceActive: () => false,
      isDocumentHidden: () => false,
      subscribeVisibility: subscribe,
    });
    expect(subscribe).not.toHaveBeenCalled();
  });
});

describe("saved background music", () => {
  afterEach(() => {
    resetBackgroundMusic();
    uninstallBackgroundMusic();
    window.history.pushState({}, "", "/");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("persists the switch and volume in localStorage, off by default", () => {
    expect(getBgMusicEnabled()).toBe(false);
    expect(getBgMusicVolume()).toBe(0.5);
    expect(localStorage.getItem(BG_MUSIC_STORAGE_KEY)).toBeNull();
    setBgMusicVolume(0.3);
    expect(
      JSON.parse(localStorage.getItem(BG_MUSIC_STORAGE_KEY) ?? ""),
    ).toEqual({ enabled: false, volume: 0.3 });
    expect(getBgMusicEnabled()).toBe(false);
    setBgMusicEnabled(true);
    expect(getBgMusicEnabled()).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(BG_MUSIC_STORAGE_KEY) ?? ""),
    ).toEqual({ enabled: true, volume: 0.3 });
    resetBackgroundMusic();
    expect(getBgMusicEnabled()).toBe(false);
    expect(getBgMusicVolume()).toBe(0.5);
    expect(localStorage.getItem(BG_MUSIC_STORAGE_KEY)).toBeNull();
  });

  it("does not construct audio or play before a gesture, and never on the kids guide", () => {
    const AudioSpy = vi.fn();
    vi.stubGlobal("Audio", AudioSpy);
    window.history.pushState({}, "", "/settings");
    installBackgroundMusic();
    expect(AudioSpy).not.toHaveBeenCalled();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    expect(AudioSpy).not.toHaveBeenCalled();
    setBgMusicEnabled(true);
    expect(AudioSpy).not.toHaveBeenCalled();

    uninstallBackgroundMusic();
    resetBackgroundMusic();
    window.history.pushState({}, "", "/guide/typing-for-kids");
    const add = vi.spyOn(document, "addEventListener");
    installBackgroundMusic();
    const gestures = add.mock.calls.filter(
      (call) => call[0] === "pointerdown" || call[0] === "keydown",
    );
    expect(gestures).toHaveLength(0);
    setBgMusicEnabled(true);
    expect(AudioSpy).not.toHaveBeenCalled();
  });
});
