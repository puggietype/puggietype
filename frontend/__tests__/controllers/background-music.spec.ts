import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BackgroundMusic,
  BG_MUSIC_SRC,
  BG_MUSIC_STORAGE_KEY,
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
} from "../../src/ts/controllers/background-music";
import {
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

  it("ships no audio file", () => {
    expect(BG_MUSIC_SRC).toBeNull();
    const source = readFileSync(
      path.resolve(__dirname, "../../src/ts/controllers/background-music.ts"),
      "utf8",
    );
    expect(source).toMatch(/TODO:/);
    expect(source).toMatch(/Monkeytype/);
    expect(source).not.toMatch(/fetch\(|sendBeacon|gtag\(/);
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
