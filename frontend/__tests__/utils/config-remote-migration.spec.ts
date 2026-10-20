import { beforeEach, describe, expect, it, vi } from "vitest";

// PUG-001: updateFromServer + the real config setters, with mocked auth + API
const h = vi.hoisted(() => ({
  uid: "uidA" as string | null,
  server: {} as Record<string, unknown>,
  status: 200 as number | "throw",
  saves: [] as unknown[],
  toasts: [] as string[],
}));

vi.mock("../../src/ts/firebase", () => ({
  app: undefined,
  Auth: undefined,
  getAuthenticatedUser: () => (h.uid !== null ? { uid: h.uid } : null),
}));
vi.mock("../../src/ts/ape", () => ({
  default: {
    configs: {
      get: async () => ({ status: 200, body: { data: { ...h.server } } }),
      save: async ({ body }: { body: Record<string, unknown> }) => {
        h.saves.push(body);
        if (h.status === "throw") throw new TypeError("Failed to fetch");
        if (h.status === 200) Object.assign(h.server, body);
        return { status: h.status, body: { message: "x" } };
      },
      delete: async () => ({ status: 200, body: {} }),
    },
  },
}));
vi.mock("../../src/ts/states/notifications", async (orig) => ({
  ...(await orig<object>()),
  showErrorNotification: (message: string) => {
    h.toasts.push(message);
  },
}));

import { updateFromServer } from "../../src/ts/config/remote";
import { setConfig } from "../../src/ts/config/setters";
import { __testing } from "../../src/ts/config/testing";
import { getDefaultConfig } from "../../src/ts/constants/default-config";
import { saveConfig } from "../../src/ts/ape/config";
import { applyConfigFromJson } from "../../src/ts/config/lifecycle";
import { setUserId } from "../../src/ts/states/core";

const { getConfig } = __testing;
const key = (uid: string): string => `puggie-config-version:remote:${uid}`;
const flush = async (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 20));
const load = async (): Promise<void> => {
  await updateFromServer();
  await flush();
};

describe("account pug migration (PUG-001)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("puggie-config-version", "1");
    h.uid = "uidA";
    setUserId("uidA");
    h.server = { ...getDefaultConfig(), monkey: false };
    h.status = 200;
    h.saves = [];
    h.toasts = [];
  });

  for (const status of [500, 503, 429, 0, "throw"] as const) {
    it(`persistent ${status}: silent, 3 saves over 5 loads, then done`, async () => {
      h.status = status;
      for (let i = 0; i < 5; i++) await load();
      expect(h.saves).toHaveLength(3);
      expect(h.toasts).toEqual([]);
      expect(localStorage.getItem(key("uidA"))).toBe("1");
      expect(getConfig().monkey).toBe(false); // account still says off
    });
  }

  for (const status of [400, 403, 422]) {
    it(`persistent ${status}: silent, one save, then done`, async () => {
      h.status = status;
      for (let i = 0; i < 5; i++) await load();
      expect(h.saves).toEqual([{ monkey: true }]);
      expect(h.toasts).toEqual([]);
      expect(localStorage.getItem(key("uidA"))).toBe("1");
    });
  }

  it("retry within the cap succeeds and writes the key, no toasts", async () => {
    h.status = 500;
    await load();
    expect(localStorage.getItem(key("uidA"))).toBeNull();
    h.status = 200;
    await load();
    expect(h.server["monkey"]).toBe(true);
    expect(getConfig().monkey).toBe(true);
    expect(localStorage.getItem(key("uidA"))).toBe("1");
    expect(h.toasts).toEqual([]);
    h.saves = [];
    await load();
    expect(h.saves).toEqual([]);
  });

  it("opt-out during a failing migration window sticks across reload", async () => {
    h.status = 500;
    await load();
    expect(getConfig().monkey).toBe(true); // migrated locally, save failed
    expect(localStorage.getItem(key("uidA"))).toBeNull();

    h.status = 200;
    vi.useFakeTimers();
    expect(setConfig("monkey", false)).toBe(true); // user turns it off
    expect(localStorage.getItem(key("uidA"))).toBe("1");
    await vi.advanceTimersByTimeAsync(1500); // debounced account save
    vi.useRealTimers();
    expect(h.server["monkey"]).toBe(false);

    h.saves = [];
    await load();
    expect(getConfig().monkey).toBe(false);
    expect(h.server["monkey"]).toBe(false);
    expect(h.saves).toEqual([]);
  });

  it("settings import during a failing migration window sticks", async () => {
    h.status = 500;
    await load();
    h.status = 200;
    await applyConfigFromJson(JSON.stringify({ monkey: false }));
    expect(localStorage.getItem(key("uidA"))).toBe("1");
    await flush();
    expect(h.server["monkey"]).toBe(false);
    h.saves = [];
    await load();
    expect(getConfig().monkey).toBe(false);
    expect(h.saves).toEqual([]);
  });

  it("user-initiated saves still toast on failure", async () => {
    h.status = 500;
    expect(await saveConfig({ monkey: false })).toBe(false);
    expect(h.toasts).toEqual(["Failed to save config"]);
  });

  it("signed out: user setting the pug records no account key", () => {
    setUserId(null);
    setConfig("monkey", false);
    const remoteKeys = Object.keys(localStorage).filter((k) =>
      k.includes(":remote:"),
    );
    expect(remoteKeys).toEqual([]);
    expect(localStorage.getItem("puggie-config-version")).toBe("1");
  });
});
