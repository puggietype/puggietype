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
