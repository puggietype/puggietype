import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ts/utils/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/ts/utils/env")>()),
  isStandalone: () => false,
}));

vi.mock("../../src/ts/test/test-logic", () => ({ restart: vi.fn() }));
vi.mock("../../src/ts/test/funbox/funbox", () => ({
  setFunbox: vi.fn(),
  toggleFunbox: vi.fn(),
}));
vi.mock("../../src/ts/test/funbox/list", () => ({
  getActiveFunboxNames: () => [],
}));

import type { FunboxName } from "@monkeytype/schemas/configs";
import { migrateConfig } from "../../src/ts/config/utils";
import { configMetadata } from "../../src/ts/config/metadata";
import {
  dropUnavailableFunboxes,
  isFunboxAvailable,
  STEAM_UNAVAILABLE_FUNBOXES,
} from "../../src/ts/platform/funbox-availability";

type Override = (o: {
  value: FunboxName[];
  currentValue: FunboxName[];
  currentConfig: unknown;
}) => FunboxName[];
const override = configMetadata.funbox.overrideValue as unknown as Override;
const run = (value: FunboxName[]): FunboxName[] =>
  override({ value, currentValue: [], currentConfig: {} });

async function funboxCommandIds(): Promise<string[]> {
  vi.resetModules();
  const mod = await import("../../src/ts/commandline/lists/funbox");
  return (mod.default[0]?.subgroup?.list ?? []).map((c) => c.id);
}

afterEach(() => vi.unstubAllGlobals());

describe("funbox availability on steam", () => {
  const steam = (): void => {
    vi.stubGlobal("__PLATFORM__", "steam");
  };

  it("poetry and wikipedia are unavailable, others are not", () => {
    steam();
    expect([...STEAM_UNAVAILABLE_FUNBOXES].sort()).toEqual([
      "poetry",
      "wikipedia",
    ]);
    expect(isFunboxAvailable("poetry")).toBe(false);
    expect(isFunboxAvailable("wikipedia")).toBe(false);
    expect(isFunboxAvailable("mirror")).toBe(true);
  });

  it("setConfig / URL / preset values drop them quietly", () => {
    steam();
    expect(run(["poetry", "mirror", "wikipedia"])).toEqual(["mirror"]);
    expect(run(["wikipedia"])).toEqual([]);
    const same: FunboxName[] = ["mirror"];
    expect(dropUnavailableFunboxes(same)).toBe(same);
  });

  it("saved, imported or synced configs are sanitized", () => {
    steam();
    const migrated = migrateConfig({ funbox: ["poetry", "mirror"] });
    expect(migrated.funbox).toEqual(["mirror"]);
    expect(migrateConfig({ funbox: "wikipedia" }).funbox).toEqual([]);
  });

  it("the command line does not list them", async () => {
    steam();
    const ids = await funboxCommandIds();
    expect(ids).not.toContain("changeFunboxpoetry");
    expect(ids).not.toContain("changeFunboxwikipedia");
    expect(ids).toContain("changeFunboxmirror");
  });

  it("toggling one on is rejected", async () => {
    steam();
    vi.resetModules();
    const { toggleFunbox } = await import("../../src/ts/config/setters");
    const { Config } = await import("../../src/ts/config/store");
    expect(toggleFunbox("poetry", true)).toBe(false);
    expect(toggleFunbox("wikipedia", true)).toBe(false);
    expect(Config.funbox).not.toContain("poetry");
    expect(Config.funbox).not.toContain("wikipedia");
  });
});

describe("funbox availability on web (unchanged)", () => {
  it("everything stays available and configs keep them", async () => {
    expect(isFunboxAvailable("poetry")).toBe(true);
    expect(isFunboxAvailable("wikipedia")).toBe(true);
    const value: FunboxName[] = ["poetry", "wikipedia"];
    expect(run(value)).toBe(value);
    expect(migrateConfig({ funbox: ["poetry", "mirror"] }).funbox).toEqual([
      "poetry",
      "mirror",
    ]);
    const ids = await funboxCommandIds();
    expect(ids).toContain("changeFunboxpoetry");
    expect(ids).toContain("changeFunboxwikipedia");
  });
});
