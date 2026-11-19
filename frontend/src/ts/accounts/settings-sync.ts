// Accounts settings sync: the whole local config goes to PUT /v1/me/settings
// while signed in, and GET /v1/me/settings after sign-in or restore. Only
// reached through import() from session.ts (VITE_FEATURE_ACCOUNTS).
import {
  Config as ConfigType,
  ConfigSchema,
} from "@monkeytype/schemas/configs";

import { getDefaultConfig } from "../constants/default-config";
import { applyConfig, configLoadPromise } from "../config/lifecycle";
import {
  saveFullConfigToLocalStorage,
  setAccountsConfigSavedListener,
} from "../config/persistence";
import { Config } from "../config/store";
import { migrateConfig } from "../config/utils";
import { getSettings, putSettings } from "./api";
import { SETTINGS_DIRTY_KEY } from "./flag";
import { callWithIdToken } from "./authed-call";
import { getAccountUser } from "./state";

/** config saves within this window become one PUT */
export const PUSH_DEBOUNCE_MS = 2000;
/** the API takes 16 KB; bigger configs stay local (and dirty) */
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

function serialize(): string {
  return JSON.stringify(Config);
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
 * The server's settings as a full config, through the same migration as a
 * local or imported one. undefined (keep local) unless it's an object with
 * at least one known config key and the result passes the config schema.
 */
export function toConfig(settings: unknown): ConfigType | undefined {
  if (
    typeof settings !== "object" ||
    settings === null ||
    Array.isArray(settings)
  ) {
    return undefined;
  }
  const known = Object.keys(getDefaultConfig());
  if (!Object.keys(settings).some((key) => known.includes(key))) {
    return undefined;
  }
  try {
    const parsed = ConfigSchema.safeParse(
      migrateConfig(structuredClone(settings)),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** PUT of the current config; dirty until the server has it */
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
  if (new TextEncoder().encode(snapshot).length > MAX_SETTINGS_BYTES) return;
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
    if (JSON.stringify(config) !== serialize()) {
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
