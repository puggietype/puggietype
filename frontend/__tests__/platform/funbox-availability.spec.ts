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
// metadata decides at module load whether funbox has an override (steam
// only), so load it fresh after the platform is stubbed.
async function funboxOverride(): Promise<Override | undefined> {
  vi.resetModules();
  const { configMetadata } = await import("../../src/ts/config/metadata");
  return configMetadata.funbox.overrideValue as unknown as Override | undefined;
}
async function run(value: FunboxName[]): Promise<FunboxName[]> {
  const override = await funboxOverride();
  return override
    ? override({ value, currentValue: [], currentConfig: {} })
    : value;
}

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

  it("setConfig / URL / preset values drop them quietly", async () => {
    steam();
    expect(await funboxOverride()).toBeTypeOf("function");
    expect(await run(["poetry", "mirror", "wikipedia"])).toEqual(["mirror"]);
    expect(await run(["wikipedia"])).toEqual([]);
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
    // web has no funbox override at all (as before the steam flavor)
    expect(await funboxOverride()).toBeUndefined();
    expect(migrateConfig({ funbox: ["poetry", "mirror"] }).funbox).toEqual([
      "poetry",
      "mirror",
    ]);
    const ids = await funboxCommandIds();
    expect(ids).toContain("changeFunboxpoetry");
    expect(ids).toContain("changeFunboxwikipedia");
  });
});
