import { describe, expect, it } from "vitest";

import type { PartialConfig } from "@monkeytype/schemas/configs";
import {
  CONFIG_VERSION,
  CONFIG_VERSION_KEY,
  MAX_REMOTE_MIGRATION_ATTEMPTS,
  migrateConfigVersion,
  readConfigVersion,
  recordUserConfigVersion,
  remoteConfigAttemptsKey,
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
    const ok = async (): Promise<number> => 200;
    const fail = async (): Promise<number> => 500;
    const reject = async (): Promise<number> => {
      throw new Error("offline");
    };

    it("missing version: turns the pug on, saves, then records version 1", async () => {
      const s = memoryStorage();
      const saved: unknown[] = [];
      const out = runRemoteConfigVersionMigration(
        oldSave,
        "u1",
        s,
        async (p) => {
          saved.push(p);
          expect(s.data.has(remoteConfigVersionKey("u1"))).toBe(false);
          return 200;
        },
      );
      expect(out.config.monkey).toBe(true);
      expect(out.changed).toBe(true);
      expect(await out.done).toBe(true);
      expect(saved).toEqual([{ monkey: true }]);
      expect(s.data.get(remoteConfigVersionKey("u1"))).toBe("1");
    });

    it("older version: migrates", async () => {
      const s = memoryStorage({ [remoteConfigVersionKey("u1")]: "0" });
      const out = runRemoteConfigVersionMigration(oldSave, "u1", s, ok);
      expect(out.changed).toBe(true);
      await out.done;
      expect(s.data.get(remoteConfigVersionKey("u1"))).toBe("1");
    });

    it("failed save: no key written, so the next load retries", async () => {
      const s = memoryStorage();
      const first = runRemoteConfigVersionMigration(oldSave, "u1", s, fail);
      expect(first.config.monkey).toBe(true);
      expect(await first.done).toBe(false);
      expect(s.data.has(remoteConfigVersionKey("u1"))).toBe(false);

      const retry = runRemoteConfigVersionMigration(oldSave, "u1", s, ok);
      expect(retry.changed).toBe(true);
      expect(await retry.done).toBe(true);
      expect(s.data.get(remoteConfigVersionKey("u1"))).toBe("1");
    });

    it("rejected save (offline) also leaves the key unset", async () => {
      const s = memoryStorage();
      const out = runRemoteConfigVersionMigration(oldSave, "u1", s, reject);
      expect(await out.done).toBe(false);
      expect(s.data.has(remoteConfigVersionKey("u1"))).toBe(false);
    });

    it("current version: an off on the account stays off, no save", async () => {
      const s = memoryStorage({ [remoteConfigVersionKey("u1")]: "1" });
      let calls = 0;
      const out = runRemoteConfigVersionMigration(
        oldSave,
        "u1",
        s,
        async () => {
          calls++;
          return 200;
        },
      );
      expect(out.config.monkey).toBe(false);
      expect(out.changed).toBe(false);
      await out.done;
      expect(calls).toBe(0);
    });

    it("runs once per account after a successful save", async () => {
      const s = memoryStorage();
      await runRemoteConfigVersionMigration(oldSave, "u1", s, ok).done;
      expect(
        runRemoteConfigVersionMigration(oldSave, "u1", s, ok).changed,
      ).toBe(false);
      expect(
        runRemoteConfigVersionMigration(oldSave, "u2", s, ok).changed,
      ).toBe(true);
    });

    it("is independent of the local version written earlier on load", () => {
      const s = memoryStorage({ [CONFIG_VERSION_KEY]: "1" });
      expect(
        runRemoteConfigVersionMigration(oldSave, "u1", s, ok).changed,
      ).toBe(true);
    });

    it("keeps the text-style exception and records the version", () => {
      const s = memoryStorage();
      const out = runRemoteConfigVersionMigration(
        { ...oldSave, liveSpeedStyle: "text" },
        "u1",
        s,
        fail,
      );
      expect(out.config.monkey).toBe(false);
      expect(out.changed).toBe(false);
      expect(s.data.get(remoteConfigVersionKey("u1"))).toBe("1");
    });

    it("server config already on: nothing to save", () => {
      const s = memoryStorage();
      expect(
        runRemoteConfigVersionMigration({ monkey: true }, "u1", s, fail)
          .changed,
      ).toBe(false);
    });

    it("no uid: does nothing and records nothing", async () => {
      const s = memoryStorage();
      const out = runRemoteConfigVersionMigration(oldSave, undefined, s, ok);
      expect(out.changed).toBe(false);
      expect(out.config.monkey).toBe(false);
      expect(await out.done).toBe(false);
      expect(s.data.size).toBe(0);
    });

    const statusSave =
      (status: number, calls: number[]) => async (): Promise<number> => {
        calls.push(status);
        return status;
      };

    it("caps retryable failures at MAX attempts across loads, then records done", async () => {
      expect(MAX_REMOTE_MIGRATION_ATTEMPTS).toBe(3);
      for (const status of [500, 429, 0, 503]) {
        const s = memoryStorage();
        const calls: number[] = [];
        for (let load = 1; load <= 5; load++) {
          const out = runRemoteConfigVersionMigration(
            oldSave,
            "u1",
            s,
            statusSave(status, calls),
          );
          expect(out.changed).toBe(load <= 3);
          expect(await out.done).toBe(load > 3);
          const recorded = s.data.get(remoteConfigVersionKey("u1"));
          expect(recorded).toBe(load >= 3 ? "1" : undefined);
        }
        expect(calls).toHaveLength(MAX_REMOTE_MIGRATION_ATTEMPTS);
      }
    });

    it("thrown save errors count toward the cap too", async () => {
      const s = memoryStorage();
      for (let load = 0; load < 4; load++) {
        await runRemoteConfigVersionMigration(oldSave, "u1", s, reject).done;
      }
      expect(s.data.get(remoteConfigAttemptsKey("u1"))).toBe("3");
      expect(s.data.get(remoteConfigVersionKey("u1"))).toBe("1");
    });

    it("429 / 5xx / 0 retry: a later success inside the cap records done", async () => {
      const s = memoryStorage();
      await runRemoteConfigVersionMigration(oldSave, "u1", s, async () => 429)
        .done;
      await runRemoteConfigVersionMigration(oldSave, "u1", s, async () => 0)
        .done;
      expect(s.data.has(remoteConfigVersionKey("u1"))).toBe(false);
      const third = runRemoteConfigVersionMigration(oldSave, "u1", s, ok);
      expect(third.changed).toBe(true);
      expect(await third.done).toBe(true);
      expect(s.data.get(remoteConfigVersionKey("u1"))).toBe("1");
    });

    it("4xx other than 429 is final: recorded after one attempt", async () => {
      for (const status of [400, 401, 403, 404, 422]) {
        const s = memoryStorage();
        const calls: number[] = [];
        const first = runRemoteConfigVersionMigration(
          oldSave,
          "u1",
          s,
          statusSave(status, calls),
        );
        expect(first.config.monkey).toBe(true);
        expect(await first.done).toBe(false);
        expect(s.data.get(remoteConfigVersionKey("u1"))).toBe("1");
        const next = runRemoteConfigVersionMigration(
          oldSave,
          "u1",
          s,
          statusSave(status, calls),
        );
        expect(next.changed).toBe(false);
        expect(next.config.monkey).toBe(false);
        expect(calls).toEqual([status]);
      }
    });

    it("attempts are counted per uid", async () => {
      const s = memoryStorage();
      for (let load = 0; load < 3; load++) {
        await runRemoteConfigVersionMigration(oldSave, "u1", s, fail).done;
      }
      expect(s.data.get(remoteConfigVersionKey("u1"))).toBe("1");
      expect(
        runRemoteConfigVersionMigration(oldSave, "u2", s, ok).changed,
      ).toBe(true);
    });

    it("user choice during a failing migration window is never overridden", async () => {
      const s = memoryStorage({ [CONFIG_VERSION_KEY]: "1" });
      await runRemoteConfigVersionMigration(oldSave, "u1", s, fail).done;
      recordUserConfigVersion("u1", s);
      const next = runRemoteConfigVersionMigration(oldSave, "u1", s, ok);
      expect(next.changed).toBe(false);
      expect(next.config.monkey).toBe(false);
    });

    it("recordUserConfigVersion: signed out only writes the local version", () => {
      const s = memoryStorage();
      recordUserConfigVersion(null, s);
      expect([...s.data.keys()]).toEqual([CONFIG_VERSION_KEY]);
      recordUserConfigVersion("u9", s);
      expect(s.data.get(remoteConfigVersionKey("u9"))).toBe("1");
    });
  });
});
