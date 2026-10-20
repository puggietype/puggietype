import type { Config } from "@monkeytype/schemas/configs";

/**
 * Version of the saved local config. Bump it and add a step in
 * migrateConfigVersion when a default change must reach returning visitors
 * (old builds save the full config, so a new default never shows otherwise).
 *
 * 1: typing pug on by default. Old saves all carry monkey:false, and an
 *    explicit off can't be told apart from a saved default, so it is turned
 *    on once; turning it off again afterwards sticks.
 */
export const CONFIG_VERSION = 1;
export const CONFIG_VERSION_KEY = "puggie-config-version";

type VersionStorage = Pick<Storage, "getItem" | "setItem">;

export function readConfigVersion(storage: VersionStorage): number {
  const raw = storage.getItem(CONFIG_VERSION_KEY);
  if (raw === null) return 0;
  const version = Number.parseInt(raw, 10);
  return Number.isFinite(version) && version >= 0 ? version : 0;
}

export function writeConfigVersion(storage: VersionStorage): void {
  storage.setItem(CONFIG_VERSION_KEY, String(CONFIG_VERSION));
}

/** pure: returns the config to apply for a save written at `fromVersion` */
export function migrateConfigVersion<T extends Partial<Config>>(
  config: T,
  fromVersion: number,
): T {
  if (fromVersion >= CONFIG_VERSION) return config;
  let next = config;
  if (
    fromVersion < 1 &&
    next.monkey === false &&
    // the pug can't be on with text live stats; don't override that choice
    next.liveSpeedStyle !== "text" &&
    next.liveAccStyle !== "text"
  ) {
    next = { ...next, monkey: true };
  }
  return next;
}

/**
 * Run once per browser: migrates a loaded local config (undefined for a
 * fresh profile) and records the current version so it never runs again.
 */
export function runConfigVersionMigration<T extends Partial<Config>>(
  config: T | undefined,
  storage: VersionStorage,
): T | undefined {
  const fromVersion = readConfigVersion(storage);
  const migrated =
    config === undefined
      ? undefined
      : migrateConfigVersion(config, fromVersion);
  if (fromVersion < CONFIG_VERSION) writeConfigVersion(storage);
  return migrated;
}

export function remoteConfigVersionKey(uid: string): string {
  return `${CONFIG_VERSION_KEY}:remote:${uid}`;
}

export function remoteConfigAttemptsKey(uid: string): string {
  return `${remoteConfigVersionKey(uid)}:attempts`;
}

/** account migration saves tried (across loads) before giving up */
export const MAX_REMOTE_MIGRATION_ATTEMPTS = 3;

/**
 * Called when the user sets the pug explicitly: records the current version
 * locally and for the signed-in account, so a pending (failed) migration can
 * never override that choice on a later load.
 */
export function recordUserConfigVersion(
  uid: string | null | undefined,
  storage: VersionStorage,
): void {
  writeConfigVersion(storage);
  if (uid !== null && uid !== undefined && uid !== "") {
    storage.setItem(remoteConfigVersionKey(uid), String(CONFIG_VERSION));
  }
}

function readCount(storage: VersionStorage, key: string): number {
  const parsed = Number.parseInt(storage.getItem(key) ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** a 4xx other than 429 won't succeed on retry */
function isFinalSaveStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

/**
 * Same one-time migration for a signed-in account's server config. Tracked
 * per account (the local key is already written by the time the server
 * config arrives). Returns the config to apply right away; when it changed,
 * the change is saved to the account (silently) and the per-account version
 * is recorded once that save succeeds. A failed save retries on the next
 * load, unless it was a final rejection (4xx other than 429) or
 * MAX_REMOTE_MIGRATION_ATTEMPTS saves have been tried; then it is recorded
 * as done anyway. Without a uid nothing runs and nothing is recorded.
 * `save` resolves to the HTTP status (0 when nothing was sent).
 */
export function runRemoteConfigVersionMigration<T extends Partial<Config>>(
  config: T,
  uid: string | undefined,
  storage: VersionStorage,
  save: (patch: Partial<Config>) => Promise<number>,
): { config: T; changed: boolean; done: Promise<boolean> } {
  if (uid === undefined || uid === "") {
    return { config, changed: false, done: Promise.resolve(false) };
  }
  const key = remoteConfigVersionKey(uid);
  const attemptsKey = remoteConfigAttemptsKey(uid);
  const fromVersion = readCount(storage, key);
  const record = (): void => {
    if (fromVersion < CONFIG_VERSION) {
      storage.setItem(key, String(CONFIG_VERSION));
    }
  };
  const attempts = readCount(storage, attemptsKey) + 1;
  const migrated =
    attempts > MAX_REMOTE_MIGRATION_ATTEMPTS
      ? config
      : migrateConfigVersion(config, fromVersion);
  if (migrated === config) {
    record();
    return { config, changed: false, done: Promise.resolve(true) };
  }
  // counted before the save, so a load closed mid-request still counts
  storage.setItem(attemptsKey, String(attempts));
  const giveUp = attempts >= MAX_REMOTE_MIGRATION_ATTEMPTS;
  const done = save({ monkey: migrated.monkey })
    .catch(() => 0)
    .then((status) => {
      const ok = status === 200;
      if (ok || giveUp || isFinalSaveStatus(status)) record();
      return ok;
    });
  return { config: migrated, changed: true, done };
}
