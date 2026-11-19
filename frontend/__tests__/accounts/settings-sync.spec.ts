import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getSettings: vi.fn(),
  putSettings: vi.fn(),
}));
vi.mock("../../src/ts/accounts/api", () => api);

// the real helper's contract: options in, result out (token refresh is
// covered in session.spec.ts)
const session = vi.hoisted(() => ({
  callWithIdToken: vi.fn(),
}));
vi.mock("../../src/ts/accounts/authed-call", () => session);

const lifecycle = vi.hoisted(() => ({
  applyConfig: vi.fn(),
  configLoadPromise: Promise.resolve(),
}));
vi.mock("../../src/ts/config/lifecycle", () => lifecycle);

// legacy backend path: must never be reached by the new sync
const legacy = vi.hoisted(() => ({
  saveConfig: vi.fn(async (_config: unknown) => false),
  saveConfigSilently: vi.fn(async () => 0),
  deleteConfig: vi.fn(async () => undefined),
}));
vi.mock("../../src/ts/ape/config", () => legacy);

const notifications = vi.hoisted(() => ({
  showNoticeNotification: vi.fn(),
  showErrorNotification: vi.fn(),
  showSuccessNotification: vi.fn(),
}));
vi.mock("../../src/ts/states/notifications", () => notifications);

import {
  type Config as ConfigType,
  ConfigSchema,
} from "@monkeytype/schemas/configs";

import { SETTINGS_DIRTY_KEY } from "../../src/ts/accounts/flag";
import {
  LOCAL_ONLY_KEYS,
  MAX_SETTINGS_BYTES,
  onAccountChange,
  PUSH_DEBOUNCE_MS,
  SYNCED_KEYS,
  toConfig,
} from "../../src/ts/accounts/settings-sync";
import { setAccountUser } from "../../src/ts/accounts/state";
import { accountsCopy } from "../../src/ts/accounts/strings";
import * as Persistence from "../../src/ts/config/persistence";
import { Config } from "../../src/ts/config/store";
import { getDefaultConfig } from "../../src/ts/constants/default-config";

const user = {
  uid: "u1",
  displayName: "Sleepy Pug 42",
  emailVerified: true,
  ageOk: true,
  lbListed: false,
  verifiedTypist: false,
  status: "active",
  createdAt: "2026-11-04T00:00:00.000Z",
};

const saveFull = vi.spyOn(Persistence, "saveFullConfigToLocalStorage");

function resetConfig(): void {
  Object.assign(Config, getDefaultConfig());
}

/** a user config change, as setConfig does it */
function userChanges(change: Partial<ConfigType>): void {
  Object.assign(Config, change);
  Persistence.saveToLocalStorage(Object.keys(change)[0] as keyof ConfigType);
}

/** what a push should send: the synced keys of the current config */
function syncedOf(config: ConfigType): Record<string, unknown> {
  return Object.fromEntries(
    SYNCED_KEYS.map((key) => [key, structuredClone(config[key])]),
  );
}

const PRIVATE_BG = "https://example.test/private/me.png?token=secret";

function serverHas(settings: unknown, updatedAt: string | null): void {
  api.getSettings.mockResolvedValue({ ok: true, settings, updatedAt });
}

function putBodies(): Record<string, unknown>[] {
  return api.putSettings.mock.calls.map(
    (c) => (c[0] as { settings: Record<string, unknown> }).settings,
  );
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function signIn(uid = "u1"): Promise<void> {
  setAccountUser({ ...user, uid });
  onAccountChange(uid);
  await settle();
}

async function afterDebounce(): Promise<void> {
  await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("__FEATURE_ACCOUNTS__", true);
  resetConfig();
  session.callWithIdToken.mockImplementation(
    async (run: (o: { apiUrl: string; idToken: string }) => Promise<unknown>) =>
      run({ apiUrl: "https://api.example.test", idToken: "id-token" }),
  );
  api.putSettings.mockImplementation(async ({ settings }) => ({
    ok: true,
    settings,
    updatedAt: "2026-11-19T00:00:00.000Z",
  }));
  lifecycle.applyConfig.mockImplementation(async (c: ConfigType) => {
    Object.assign(Config, c);
    // applyConfig re-saves keys it had to reset; that must not push
    Persistence.saveToLocalStorage("theme");
  });
  saveFull.mockImplementation(() => undefined);
});

afterEach(() => {
  onAccountChange(null);
  setAccountUser(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("settings sync: pull after sign-in", () => {
  it("server settings win on this device, without a push", async () => {
    serverHas({ ...getDefaultConfig(), theme: "nord", time: 60 }, "2026-11-18");
    await signIn();
    expect(api.getSettings).toHaveBeenCalledTimes(1);
    expect(lifecycle.applyConfig).toHaveBeenCalledTimes(1);
    expect(lifecycle.applyConfig.mock.calls[0]?.[0]).toMatchObject({
      theme: "nord",
      time: 60,
    });
    expect(Config.theme).toBe("nord");
    // persisted locally, as a no-db save
    expect(saveFull).toHaveBeenCalledWith(true);
    await afterDebounce();
    expect(api.putSettings).not.toHaveBeenCalled();
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBeNull();
  });

  it("a partial server config only changes the keys it has", async () => {
    Config.theme = "alduin";
    serverHas({ time: 30, notAConfigKey: true }, "2026-11-18");
    await signIn();
    const applied = lifecycle.applyConfig.mock.calls[0]?.[0] as ConfigType;
    expect(applied.time).toBe(30);
    expect(applied).not.toHaveProperty("notAConfigKey");
    expect(applied.theme).toBe("alduin");
  });

  it("local-only keys from the server are ignored, local values kept", async () => {
    Config.customBackground = "";
    Config.fontFamily = "My_Font";
    serverHas(
      {
        ...getDefaultConfig(),
        theme: "nord",
        customBackground: PRIVATE_BG,
        customBackgroundSize: "contain",
        fontFamily: "Roboto_Mono",
      },
      "2026-11-18",
    );
    await signIn();
    expect(Config.theme).toBe("nord");
    expect(Config.customBackground).toBe("");
    expect(Config.customBackgroundSize).toBe(
      getDefaultConfig().customBackgroundSize,
    );
    expect(Config.fontFamily).toBe("My_Font");
  });

  it("only local-only keys from the server: nothing applied", async () => {
    serverHas({ customBackground: PRIVATE_BG }, "2026-11-18");
    await signIn();
    expect(lifecycle.applyConfig).not.toHaveBeenCalled();
  });

  it("first sync: no server settings, the local config is pushed", async () => {
    Config.theme = "nord";
    serverHas({}, null);
    await signIn();
    expect(lifecycle.applyConfig).not.toHaveBeenCalled();
    expect(api.putSettings).toHaveBeenCalledTimes(1);
    expect(putBodies()[0]).toEqual(syncedOf(Config));
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBeNull();
    // the new path never goes through the legacy backend stubs
    expect(legacy.saveConfig).not.toHaveBeenCalled();
    expect(legacy.saveConfigSilently).not.toHaveBeenCalled();
  });

  it("dirty for this uid: local is pushed instead of applying the server's", async () => {
    localStorage.setItem(SETTINGS_DIRTY_KEY, "u1");
    Config.theme = "8008";
    serverHas({ ...getDefaultConfig(), theme: "nord" }, "2026-11-18");
    await signIn();
    expect(lifecycle.applyConfig).not.toHaveBeenCalled();
    expect(putBodies()[0]?.["theme"]).toBe("8008");
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBeNull();
  });

  it("dirty for another uid doesn't count", async () => {
    localStorage.setItem(SETTINGS_DIRTY_KEY, "someone-else");
    serverHas({ ...getDefaultConfig(), theme: "nord" }, "2026-11-18");
    await signIn();
    expect(lifecycle.applyConfig).toHaveBeenCalledTimes(1);
    expect(api.putSettings).not.toHaveBeenCalled();
  });

  it("a config change while the pull is in flight wins over the server", async () => {
    let answer: (v: unknown) => void = () => undefined;
    api.getSettings.mockReturnValue(new Promise((r) => (answer = r)));
    await signIn();
    userChanges({ theme: "aether" });
    answer({
      ok: true,
      settings: { ...getDefaultConfig(), theme: "nord" },
      updatedAt: "2026-11-18",
    });
    await settle();
    expect(lifecycle.applyConfig).not.toHaveBeenCalled();
    expect(putBodies()[0]?.["theme"]).toBe("aether");
  });

  it.each([
    ["an array", []],
    ["a string", "theme=nord"],
    ["no known keys", { foo: 1, bar: "x" }],
    ["null", null],
  ])("invalid server settings (%s) are ignored, local kept", async (_l, s) => {
    Config.theme = "alduin";
    serverHas(s, "2026-11-18");
    await signIn();
    expect(lifecycle.applyConfig).not.toHaveBeenCalled();
    expect(Config.theme).toBe("alduin");
    await afterDebounce();
    expect(api.putSettings).not.toHaveBeenCalled();
  });

  it("toConfig keeps the local value for an invalid one, takes valid ones", () => {
    const local = { ...getDefaultConfig(), time: 120 };
    const config = toConfig({ time: "sixty", theme: "nord" }, local);
    expect(config?.time).toBe(120);
    expect(config?.theme).toBe("nord");
  });

  it("toConfig: no valid synced value means keep local", () => {
    expect(toConfig({ time: "sixty", theme: "not-a-theme" })).toBeUndefined();
  });

  it("a failed pull changes nothing", async () => {
    Config.theme = "alduin";
    api.getSettings.mockResolvedValue({
      ok: false,
      status: 0,
      code: "",
      message: "x",
    });
    await signIn();
    expect(lifecycle.applyConfig).not.toHaveBeenCalled();
    expect(api.putSettings).not.toHaveBeenCalled();
    expect(Config.theme).toBe("alduin");
  });
});

describe("settings sync: push on config saves", () => {
  beforeEach(() => {
    serverHas({ ...getDefaultConfig() }, "2026-11-18");
  });

  it("debounce collapses many saves into one PUT of the synced keys", async () => {
    await signIn();
    userChanges({ theme: "arch" });
    userChanges({ time: 60 });
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    userChanges({ theme: "beach" });
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBe("u1");
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    expect(api.putSettings).not.toHaveBeenCalled();
    await afterDebounce();
    expect(api.putSettings).toHaveBeenCalledTimes(1);
    expect(putBodies()[0]).toMatchObject({ theme: "beach", time: 60 });
    expect(Object.keys(putBodies()[0] ?? {}).sort()).toEqual(
      [...SYNCED_KEYS].sort(),
    );
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBeNull();
    expect(api.putSettings.mock.calls[0]?.[0]).toMatchObject({
      apiUrl: "https://api.example.test",
      idToken: "id-token",
    });
    // the legacy path still runs exactly as before: its own 1 s debounce,
    // only the changed keys (a no-op signed out of the legacy backend)
    expect(legacy.saveConfig).toHaveBeenCalledTimes(2);
    expect(legacy.saveConfig.mock.calls[0]?.[0]).toEqual({
      theme: "arch",
      time: 60,
    });
  });

  it("a failed PUT keeps the dirty marker", async () => {
    await signIn();
    api.putSettings.mockResolvedValue({
      ok: false,
      status: 503,
      code: "",
      message: "x",
    });
    userChanges({ theme: "arch" });
    await afterDebounce();
    expect(api.putSettings).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBe("u1");
  });

  it("a PUT that throws keeps the dirty marker and doesn't escape", async () => {
    await signIn();
    session.callWithIdToken.mockRejectedValueOnce(new Error("boom"));
    userChanges({ theme: "arch" });
    await afterDebounce();
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBe("u1");
  });

  it("local-only keys never leave the device", async () => {
    await signIn();
    userChanges({ customBackground: PRIVATE_BG, theme: "arch" });
    userChanges({ fontFamily: "My_Font" });
    await afterDebounce();
    expect(api.putSettings).toHaveBeenCalledTimes(1);
    const body = JSON.stringify(putBodies()[0]);
    expect(body).toContain('"theme":"arch"');
    for (const key of LOCAL_ONLY_KEYS) {
      expect(putBodies()[0]).not.toHaveProperty(key);
    }
    expect(body).not.toContain("secret");
    expect(body).not.toContain("My_Font");
  });

  it("a local-only change alone doesn't push", async () => {
    await signIn();
    userChanges({ customBackground: PRIVATE_BG });
    await afterDebounce();
    expect(api.putSettings).not.toHaveBeenCalled();
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBeNull();
  });

  it("oversize settings: skipped, stay dirty, one quiet notice per session", async () => {
    await signIn();
    const huge = Array.from({ length: MAX_SETTINGS_BYTES }, () => "nord");
    userChanges({ favThemes: huge as ConfigType["favThemes"] });
    await afterDebounce();
    expect(api.putSettings).not.toHaveBeenCalled();
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBe("u1");
    expect(notifications.showNoticeNotification).toHaveBeenCalledTimes(1);
    expect(notifications.showNoticeNotification).toHaveBeenCalledWith(
      accountsCopy.api.tooLarge,
    );
    // more saves, and a new sign-in: still the one notice
    userChanges({ theme: "arch" });
    await afterDebounce();
    onAccountChange(null);
    await signIn();
    userChanges({ theme: "beach" });
    await afterDebounce();
    expect(api.putSettings).not.toHaveBeenCalled();
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBe("u1");
    expect(notifications.showNoticeNotification).toHaveBeenCalledTimes(1);
    expect(notifications.showErrorNotification).not.toHaveBeenCalled();
    expect(notifications.showSuccessNotification).not.toHaveBeenCalled();
  });

  it("404 no_account stops syncing quietly", async () => {
    await signIn();
    api.putSettings.mockResolvedValue({
      ok: false,
      status: 404,
      code: "no_account",
      message: "x",
    });
    userChanges({ theme: "arch" });
    await afterDebounce();
    userChanges({ theme: "beach" });
    await afterDebounce();
    expect(api.putSettings).toHaveBeenCalledTimes(1);
  });

  it("no_account on the pull stops syncing too", async () => {
    api.getSettings.mockResolvedValue({
      ok: false,
      status: 404,
      code: "no_account",
      message: "x",
    });
    await signIn();
    userChanges({ theme: "arch" });
    await afterDebounce();
    expect(api.putSettings).not.toHaveBeenCalled();
  });

  it("sign-out cancels a pending push", async () => {
    await signIn();
    userChanges({ theme: "arch" });
    setAccountUser(null);
    onAccountChange(null);
    await afterDebounce();
    expect(api.putSettings).not.toHaveBeenCalled();
    userChanges({ theme: "beach" });
    await afterDebounce();
    expect(api.putSettings).not.toHaveBeenCalled();
  });

  it("never syncs while signed out", async () => {
    userChanges({ theme: "arch" });
    await afterDebounce();
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(api.putSettings).not.toHaveBeenCalled();
    expect(localStorage.getItem(SETTINGS_DIRTY_KEY)).toBeNull();
  });

  it("a save with noDbCheck (boot, pull) never pushes", async () => {
    await signIn();
    saveFull.mockRestore();
    Persistence.saveFullConfigToLocalStorage(true);
    await afterDebounce();
    expect(api.putSettings).not.toHaveBeenCalled();
  });

  it("flag off: config saves never reach the sync", async () => {
    await signIn();
    vi.stubGlobal("__FEATURE_ACCOUNTS__", false);
    userChanges({ theme: "arch" });
    await afterDebounce();
    expect(api.putSettings).not.toHaveBeenCalled();
  });
});

describe("settings sync: scope", () => {
  const all = Object.keys(ConfigSchema.shape);

  it("every config key is either synced or local-only (decide for new keys)", () => {
    const listed = [...SYNCED_KEYS, ...LOCAL_ONLY_KEYS] as string[];
    expect(all.filter((key) => !listed.includes(key))).toEqual([]);
    expect(listed.filter((key) => !all.includes(key))).toEqual([]);
  });

  it("no key is in both lists, or twice", () => {
    const listed = [...SYNCED_KEYS, ...LOCAL_ONLY_KEYS];
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("free-text and URL keys stay local", () => {
    expect(LOCAL_ONLY_KEYS).toEqual(
      expect.arrayContaining(["customBackground", "fontFamily"]),
    );
  });
});
