// Accounts settings sync: the allowlisted config keys (SYNCED_KEYS) go to
// PUT /v1/me/settings while signed in, and GET /v1/me/settings after sign-in
// or restore. Only reached through import() from session.ts
// (VITE_FEATURE_ACCOUNTS).
import {
  ConfigKey,
  Config as ConfigType,
  ConfigSchema,
} from "@monkeytype/schemas/configs";

import { applyConfig, configLoadPromise } from "../config/lifecycle";
import {
  saveFullConfigToLocalStorage,
  setAccountsConfigSavedListener,
} from "../config/persistence";
import { Config } from "../config/store";
import { migrateConfig } from "../config/utils";
import { showNoticeNotification } from "../states/notifications";
import { getSettings, putSettings } from "./api";
import { SETTINGS_DIRTY_KEY } from "./flag";
import { callWithIdToken } from "./authed-call";
import { getAccountUser } from "./state";
import { accountsCopy } from "./strings";

/**
 * Never sent to or taken from the server (Legal review 2026-11-19, M3):
 * free text, URLs, or values that only make sense on this device.
 */
export const LOCAL_ONLY_KEYS = [
  // any http(s) image URL, up to 2048 chars: may hold tokens or private paths
  "customBackground",
  // only describe customBackground, which stays here
  "customBackgroundSize",
  "customBackgroundFilter",
  // besides the built-in fonts, any typed name of a font installed locally
  "fontFamily",
] as const satisfies readonly ConfigKey[];

/**
 * The only config keys that sync. Every value is an enum, number, boolean or
 * a list of known names (themes, layouts, languages, funboxes, hex colors).
 * A new config key must be added here or to LOCAL_ONLY_KEYS (a test fails
 * otherwise).
 */
export const SYNCED_KEYS = [
  // test
  "punctuation",
  "numbers",
  "words",
  "time",
  "mode",
  "quoteLength",
  "language",
  "burstHeatmap",
  // behavior
  "difficulty",
  "quickRestart",
  "repeatQuotes",
  "resultSaving",
  "blindMode",
  "alwaysShowWordsHistory",
  "singleListCommandLine",
  "minWpm",
  "minWpmCustomSpeed",
  "minAcc",
  "minAccCustom",
  "minBurst",
  "minBurstCustomSpeed",
  "britishEnglish",
  "funbox",
  "customLayoutfluid",
  "customPolyglot",
  // input
  "freedomMode",
  "strictSpace",
  "oppositeShiftMode",
  "stopOnError",
  "deleteOnError",
  "confidenceMode",
  "quickEnd",
  "indicateTypos",
  "compositionDisplay",
  "hideExtraLetters",
  "lazyMode",
  "layout",
  "codeUnindentOnBackspace",
  // sound
  "soundVolume",
  "playSoundOnClick",
  "playSoundOnError",
  "playTimeWarning",
  // caret
  "smoothCaret",
  "caretStyle",
  "paceCaret",
  "paceCaretCustomSpeed",
  "paceCaretStyle",
  "repeatedPace",
  // appearance
  "timerStyle",
  "liveSpeedStyle",
  "liveAccStyle",
  "liveBurstStyle",
  "timerColor",
  "timerOpacity",
  "highlightMode",
  "typedEffect",
  "tapeMode",
  "tapeMargin",
  "smoothLineScroll",
  "showAllLines",
  "alwaysShowDecimalPlaces",
  "typingSpeedUnit",
  "startGraphsAtZero",
  "maxLineWidth",
  "fontSize",
  "keymapMode",
  "keymapLayout",
  "keymapStyle",
  "keymapLegendStyle",
  "keymapKeys",
  "keymapSize",
  // theme
  "flipTestColors",
  "colorfulMode",
  "autoSwitchTheme",
  "themeLight",
  "themeDark",
  "randomTheme",
  "favThemes",
  "theme",
  "customTheme",
  "customThemeColors",
  // hide elements
  "showKeyTips",
  "showOutOfFocusWarning",
  "capsLockWarning",
  "showAverage",
  "showPb",
  // other (hidden)
  "accountChart",
  "monkey",
  "monkeyPowerLevel",
  // ads
  "ads",
] as const satisfies readonly ConfigKey[];

/** config saves within this window become one PUT */
export const PUSH_DEBOUNCE_MS = 2000;
/** the API takes 16 KB; bigger settings stay local (and dirty) */
export const MAX_SETTINGS_BYTES = 15_000;

// the uid sync runs for, null while signed out
let syncUid: string | null = null;
// no_account: quiet until the next sign-in
let stopped = false;
// the serialized config the server has, as far as this tab knows
let lastSynced: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let pulling: Promise<void> | undefined;
let pushing = false;
// set while a pulled config is applied, so it isn't pushed straight back
let applying = false;
// the "too large" notice, once per page load
let tooLargeShown = false;

/** the synced part of a config */
function syncedPart(config: ConfigType): Partial<ConfigType> {
  const part: Partial<ConfigType> = {};
  for (const key of SYNCED_KEYS) {
    (part as Record<string, unknown>)[key] = config[key];
  }
  return part;
}

function serialize(): string {
  return JSON.stringify(syncedPart(Config));
}

function isDirty(uid: string): boolean {
  return localStorage.getItem(SETTINGS_DIRTY_KEY) === uid;
}

function markDirty(uid: string): void {
  localStorage.setItem(SETTINGS_DIRTY_KEY, uid);
}

function clearDirty(uid: string): void {
  if (isDirty(uid)) localStorage.removeItem(SETTINGS_DIRTY_KEY);
}

function isCurrent(uid: string): boolean {
  return syncUid === uid && getAccountUser()?.uid === uid && !stopped;
}

/**
 * The local config with the server's synced keys applied. Other keys from
 * the server are ignored, and each value must pass its schema or the local
 * one stays. undefined (keep local) unless it's an object with at least one
 * valid synced key and the result passes the config schema.
 */
export function toConfig(
  settings: unknown,
  local: ConfigType = Config,
): ConfigType | undefined {
  if (
    typeof settings !== "object" ||
    settings === null ||
    Array.isArray(settings)
  ) {
    return undefined;
  }
  const server = settings as Record<string, unknown>;
  const merged: Record<string, unknown> = structuredClone(local);
  let taken = 0;
  for (const key of SYNCED_KEYS) {
    if (!Object.hasOwn(server, key)) continue;
    const parsed = ConfigSchema.shape[key].safeParse(server[key]);
    if (!parsed.success) continue;
    merged[key] = parsed.data;
    taken++;
  }
  if (taken === 0) return undefined;
  try {
    // the same platform resets as a local or imported config
    const parsed = ConfigSchema.safeParse(migrateConfig(merged));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** PUT of the synced keys; dirty until the server has them */
async function push(uid: string): Promise<void> {
  if (!isCurrent(uid)) return;
  if (pushing) {
    schedule(uid);
    return;
  }
  const snapshot = serialize();
  if (snapshot === lastSynced) {
    clearDirty(uid);
    return;
  }
  markDirty(uid);
  if (new TextEncoder().encode(snapshot).length > MAX_SETTINGS_BYTES) {
    // a notice, not an error: nothing is lost on this device
    if (!tooLargeShown) {
      tooLargeShown = true;
      showNoticeNotification(accountsCopy.api.tooLarge);
    }
    return;
  }
  pushing = true;
  try {
    const settings = JSON.parse(snapshot) as Record<string, unknown>;
    const result = await callWithIdToken(async (options) =>
      putSettings({ ...options, settings }),
    );
    if (syncUid !== uid) return;
    if (result.ok) {
      lastSynced = snapshot;
      // a change made during the request has its own push scheduled
      if (serialize() === snapshot) clearDirty(uid);
    } else if (result.code === "no_account") {
      stopSync();
    }
  } finally {
    pushing = false;
  }
}

function schedule(uid: string): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void (async () => {
      await pulling;
      await push(uid);
    })().catch(() => undefined);
  }, PUSH_DEBOUNCE_MS);
}

/** persistence.ts calls this after every user config save */
function onConfigSaved(): void {
  const uid = syncUid;
  if (uid === null || applying || !isCurrent(uid)) return;
  // pending counts as dirty: a reload before the PUT keeps local
  markDirty(uid);
  schedule(uid);
}

async function pull(uid: string): Promise<void> {
  await configLoadPromise;
  if (!isCurrent(uid)) return;
  const result = await callWithIdToken(getSettings);
  if (!isCurrent(uid)) return;
  if (!result.ok) {
    if (result.code === "no_account") stopSync();
    return;
  }
  // first sync, or this device has changes the server never got
  if (result.updatedAt === null || isDirty(uid)) {
    await push(uid);
    return;
  }
  const config = toConfig(result.settings);
  if (config === undefined) return;
  applying = true;
  try {
    if (JSON.stringify(config) !== JSON.stringify(Config)) {
      await applyConfig(config);
      saveFullConfigToLocalStorage(true);
    }
    lastSynced = serialize();
  } finally {
    applying = false;
  }
}

function stopSync(): void {
  clearTimeout(timer);
  timer = undefined;
  stopped = true;
  setAccountsConfigSavedListener(undefined);
}

/** session.ts: the signed-in uid changed (null = signed out) */
export function onAccountChange(uid: string | null): void {
  if (uid === syncUid && !stopped) return;
  clearTimeout(timer);
  timer = undefined;
  syncUid = uid;
  stopped = false;
  lastSynced = undefined;
  if (uid === null) {
    setAccountsConfigSavedListener(undefined);
    pulling = undefined;
    return;
  }
  setAccountsConfigSavedListener(onConfigSaved);
  pulling = pull(uid).catch(() => undefined);
}
