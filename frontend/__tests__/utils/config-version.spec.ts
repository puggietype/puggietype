import { describe, expect, it } from "vitest";

import type { PartialConfig } from "@monkeytype/schemas/configs";
import {
  CONFIG_VERSION,
  CONFIG_VERSION_KEY,
  migrateConfigVersion,
  readConfigVersion,
  remoteConfigVersionKey,
  runConfigVersionMigration,
  runRemoteConfigVersionMigration,
} from "../../src/ts/config/version";

type MemoryStorage = {
  data: Map<string, string>;
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
};

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const oldSave: PartialConfig = {
  monkey: false,
  liveSpeedStyle: "off",
  liveAccStyle: "off",
  theme: "puggie_dark",
};

describe("config version migration", () => {
  it("is at version 1", () => {
    expect(CONFIG_VERSION).toBe(1);
  });

  it("missing version: turns the pug on once and saves the version", () => {
    const s = memoryStorage();
    const out = runConfigVersionMigration(oldSave, s);
    expect(out?.monkey).toBe(true);
    expect(out?.theme).toBe("puggie_dark");
    expect(s.data.get(CONFIG_VERSION_KEY)).toBe(String(CONFIG_VERSION));
  });

  it("older version: turns the pug on and saves the version", () => {
    const s = memoryStorage({ [CONFIG_VERSION_KEY]: "0" });
    expect(runConfigVersionMigration(oldSave, s)?.monkey).toBe(true);
    expect(readConfigVersion(s)).toBe(CONFIG_VERSION);
  });

  it("current version: a later off stays off", () => {
    const s = memoryStorage({ [CONFIG_VERSION_KEY]: String(CONFIG_VERSION) });
    expect(runConfigVersionMigration(oldSave, s)?.monkey).toBe(false);
  });

  it("runs once: off after the migration stays off on the next load", () => {
    const s = memoryStorage();
    runConfigVersionMigration(oldSave, s);
    expect(runConfigVersionMigration({ ...oldSave }, s)?.monkey).toBe(false);
  });

  it("fresh profile: nothing to migrate, version saved", () => {
    const s = memoryStorage();
    expect(runConfigVersionMigration(undefined, s)).toBeUndefined();
    expect(readConfigVersion(s)).toBe(CONFIG_VERSION);
  });

  it("leaves monkey:true and text live stats alone", () => {
    expect(migrateConfigVersion({ monkey: true }, 0).monkey).toBe(true);
    expect(
      migrateConfigVersion({ monkey: false, liveSpeedStyle: "text" }, 0).monkey,
    ).toBe(false);
    expect(
      migrateConfigVersion({ monkey: false, liveAccStyle: "text" }, 0).monkey,
    ).toBe(false);
  });

  it("treats a garbled version as missing", () => {
    expect(
      readConfigVersion(memoryStorage({ [CONFIG_VERSION_KEY]: "x" })),
    ).toBe(0);
    expect(
      readConfigVersion(memoryStorage({ [CONFIG_VERSION_KEY]: "-3" })),
    ).toBe(0);
  });

  describe("server config", () => {
    it("missing version: turns the pug on, flags a save, records version 1", () => {
      const s = memoryStorage();
      const out = runRemoteConfigVersionMigration(oldSave, "u1", s);
      expect(out.config.monkey).toBe(true);
      expect(out.changed).toBe(true);
      expect(s.data.get(remoteConfigVersionKey("u1"))).toBe("1");
    });

    it("older version: migrates", () => {
      const s = memoryStorage({ [remoteConfigVersionKey("u1")]: "0" });
      expect(runRemoteConfigVersionMigration(oldSave, "u1", s).changed).toBe(
        true,
      );
    });

    it("current version: an off on the account stays off", () => {
      const s = memoryStorage({ [remoteConfigVersionKey("u1")]: "1" });
      const out = runRemoteConfigVersionMigration(oldSave, "u1", s);
      expect(out.config.monkey).toBe(false);
      expect(out.changed).toBe(false);
    });

    it("runs once per account", () => {
      const s = memoryStorage();
      runRemoteConfigVersionMigration(oldSave, "u1", s);
      expect(runRemoteConfigVersionMigration(oldSave, "u1", s).changed).toBe(
        false,
      );
      expect(runRemoteConfigVersionMigration(oldSave, "u2", s).changed).toBe(
        true,
      );
    });

    it("is independent of the local version written earlier on load", () => {
      const s = memoryStorage({ [CONFIG_VERSION_KEY]: "1" });
      expect(runRemoteConfigVersionMigration(oldSave, "u1", s).changed).toBe(
        true,
      );
    });

    it("keeps the text-style exception", () => {
      const s = memoryStorage();
      const out = runRemoteConfigVersionMigration(
        { ...oldSave, liveSpeedStyle: "text" },
        "u1",
        s,
      );
      expect(out.config.monkey).toBe(false);
      expect(out.changed).toBe(false);
      expect(s.data.get(remoteConfigVersionKey("u1"))).toBe("1");
    });

    it("server config already on: nothing to save", () => {
      const s = memoryStorage();
      const out = runRemoteConfigVersionMigration({ monkey: true }, "u1", s);
      expect(out.changed).toBe(false);
    });

    it("no uid: does nothing and records nothing", () => {
      const s = memoryStorage();
      const out = runRemoteConfigVersionMigration(oldSave, undefined, s);
      expect(out.changed).toBe(false);
      expect(out.config.monkey).toBe(false);
      expect(s.data.size).toBe(0);
    });
  });
});
